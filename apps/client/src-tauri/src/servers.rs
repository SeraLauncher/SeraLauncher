use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerEntry {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub icon: Option<String>, // Base64 data URI
    pub accept_textures: Option<i8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingResult {
    pub motd: String,
    pub version_name: String,
    pub protocol: i32,
    pub players_online: u32,
    pub players_max: u32,
    pub ping_ms: u64,
    pub favicon: Option<String>,
}

fn servers_dat_path(game_dir: &Path) -> PathBuf {
    game_dir.join("servers.dat")
}

/// Strips Minecraft section sign formatting codes (§0-§f, §k-§r)
fn strip_color_codes(s: &str) -> String {
    let mut res = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            res.push(c);
        }
    }
    res.trim().to_string()
}

/// Reads `<instance>/minecraft/servers.dat`
pub fn read_servers_dat(game_dir: &Path) -> Result<Vec<ServerEntry>, String> {
    let path = servers_dat_path(game_dir);
    if !path.is_file() {
        return Ok(Vec::new());
    }

    let file = File::open(&path).map_err(|e| format!("Could not open servers.dat: {}", e))?;
    let mut decompressed = Vec::new();

    // servers.dat is gzipped NBT; fallback to uncompressed if gzip fails
    let mut gz = flate2::read::GzDecoder::new(file);
    if gz.read_to_end(&mut decompressed).is_err() {
        decompressed = std::fs::read(&path).map_err(|e| e.to_string())?;
    }

    parse_servers_nbt(&decompressed)
}

fn parse_servers_nbt(data: &[u8]) -> Result<Vec<ServerEntry>, String> {
    let mut cursor = 0;

    fn read_u8(data: &[u8], cursor: &mut usize) -> Option<u8> {
        if *cursor < data.len() {
            let b = data[*cursor];
            *cursor += 1;
            Some(b)
        } else {
            None
        }
    }

    fn read_i8(data: &[u8], cursor: &mut usize) -> Option<i8> {
        read_u8(data, cursor).map(|b| b as i8)
    }

    fn read_i16(data: &[u8], cursor: &mut usize) -> Option<i16> {
        if *cursor + 2 <= data.len() {
            let val = i16::from_be_bytes([data[*cursor], data[*cursor + 1]]);
            *cursor += 2;
            Some(val)
        } else {
            None
        }
    }

    fn read_i32(data: &[u8], cursor: &mut usize) -> Option<i32> {
        if *cursor + 4 <= data.len() {
            let val = i32::from_be_bytes([
                data[*cursor],
                data[*cursor + 1],
                data[*cursor + 2],
                data[*cursor + 3],
            ]);
            *cursor += 4;
            Some(val)
        } else {
            None
        }
    }

    fn read_string(data: &[u8], cursor: &mut usize) -> Option<String> {
        let len = read_i16(data, cursor)? as usize;
        if *cursor + len <= data.len() {
            let s = String::from_utf8_lossy(&data[*cursor..*cursor + len]).to_string();
            *cursor += len;
            Some(s)
        } else {
            None
        }
    }

    fn skip_payload(tag: u8, data: &[u8], cursor: &mut usize) -> bool {
        match tag {
            1 => { *cursor += 1; true }
            2 => { *cursor += 2; true }
            3 => { *cursor += 4; true }
            4 => { *cursor += 8; true }
            5 => { *cursor += 4; true }
            6 => { *cursor += 8; true }
            7 => {
                if let Some(len) = read_i32(data, cursor) {
                    *cursor += len.max(0) as usize;
                    true
                } else {
                    false
                }
            }
            8 => {
                if let Some(len) = read_i16(data, cursor) {
                    *cursor += len.max(0) as usize;
                    true
                } else {
                    false
                }
            }
            9 => {
                let elem_tag = match read_u8(data, cursor) {
                    Some(t) => t,
                    None => return false,
                };
                let count = match read_i32(data, cursor) {
                    Some(c) => c.max(0) as usize,
                    None => return false,
                };
                for _ in 0..count {
                    if !skip_payload(elem_tag, data, cursor) {
                        return false;
                    }
                }
                true
            }
            10 => {
                loop {
                    let sub_tag = match read_u8(data, cursor) {
                        Some(t) => t,
                        None => return false,
                    };
                    if sub_tag == 0 {
                        break;
                    }
                    if read_string(data, cursor).is_none() {
                        return false;
                    }
                    if !skip_payload(sub_tag, data, cursor) {
                        return false;
                    }
                }
                true
            }
            _ => false,
        }
    }

    // Root tag must be compound (0x0A)
    if let Some(10) = read_u8(data, &mut cursor) {
        let _ = read_string(data, &mut cursor); // Root name
    } else {
        return Ok(Vec::new());
    }

    let mut servers = Vec::new();

    loop {
        let tag = match read_u8(data, &mut cursor) {
            Some(t) => t,
            None => break,
        };
        if tag == 0 {
            break;
        }
        let tag_name = match read_string(data, &mut cursor) {
            Some(n) => n,
            None => break,
        };

        if tag_name == "servers" && tag == 9 {
            // TAG_List
            let elem_tag = match read_u8(data, &mut cursor) {
                Some(t) => t,
                None => break,
            };
            let count = match read_i32(data, &mut cursor) {
                Some(c) => c.max(0) as usize,
                None => break,
            };

            if elem_tag == 10 {
                // Compounds in list have no name field
                for _ in 0..count {
                    let mut s_name = String::new();
                    let mut s_ip = String::new();
                    let mut s_icon = None;
                    let mut s_accept = None;

                    loop {
                        let sub_tag = match read_u8(data, &mut cursor) {
                            Some(t) => t,
                            None => break,
                        };
                        if sub_tag == 0 {
                            break;
                        }
                        let prop_name = match read_string(data, &mut cursor) {
                            Some(n) => n,
                            None => break,
                        };

                        match prop_name.as_str() {
                            "name" if sub_tag == 8 => {
                                s_name = read_string(data, &mut cursor).unwrap_or_default();
                            }
                            "ip" if sub_tag == 8 => {
                                s_ip = read_string(data, &mut cursor).unwrap_or_default();
                            }
                            "icon" if sub_tag == 8 => {
                                let raw_icon = read_string(data, &mut cursor);
                                s_icon = raw_icon.map(|raw| {
                                    if raw.starts_with("data:") {
                                        raw
                                    } else {
                                        format!("data:image/png;base64,{}", raw)
                                    }
                                });
                            }
                            "acceptTextures" if sub_tag == 1 => {
                                s_accept = read_i8(data, &mut cursor);
                            }
                            _ => {
                                let _ = skip_payload(sub_tag, data, &mut cursor);
                            }
                        }
                    }

                    if !s_ip.is_empty() {
                        let id = format!("{}:{}", s_name, s_ip);
                        servers.push(ServerEntry {
                            id,
                            name: s_name,
                            ip: s_ip,
                            icon: s_icon,
                            accept_textures: s_accept,
                        });
                    }
                }
            } else {
                let _ = skip_payload(tag, data, &mut cursor);
            }
        } else {
            let _ = skip_payload(tag, data, &mut cursor);
        }
    }

    Ok(servers)
}

/// Serializes and writes servers list to `<instance>/minecraft/servers.dat`
pub fn write_servers_dat(game_dir: &Path, servers: &[ServerEntry]) -> Result<(), String> {
    let mut nbt_bytes = Vec::new();

    // Helper closures to write NBT primitives
    fn write_u8(vec: &mut Vec<u8>, b: u8) {
        vec.push(b);
    }
    fn write_i16(vec: &mut Vec<u8>, val: i16) {
        vec.extend_from_slice(&val.to_be_bytes());
    }
    fn write_i32(vec: &mut Vec<u8>, val: i32) {
        vec.extend_from_slice(&val.to_be_bytes());
    }
    fn write_string(vec: &mut Vec<u8>, s: &str) {
        write_i16(vec, s.len() as i16);
        vec.extend_from_slice(s.as_bytes());
    }

    // Root compound (TAG_Compound = 10)
    write_u8(&mut nbt_bytes, 10);
    write_string(&mut nbt_bytes, "");

    // Tag 'servers' (TAG_List = 9)
    write_u8(&mut nbt_bytes, 9);
    write_string(&mut nbt_bytes, "servers");

    // List header: elem_type = TAG_Compound (10), length
    write_u8(&mut nbt_bytes, 10);
    write_i32(&mut nbt_bytes, servers.len() as i32);

    for s in servers {
        // Tag 'name'
        write_u8(&mut nbt_bytes, 8);
        write_string(&mut nbt_bytes, "name");
        write_string(&mut nbt_bytes, &s.name);

        // Tag 'ip'
        write_u8(&mut nbt_bytes, 8);
        write_string(&mut nbt_bytes, "ip");
        write_string(&mut nbt_bytes, &s.ip);

        // Tag 'icon' (if any)
        if let Some(ref icon) = s.icon {
            let raw_base64 = if icon.starts_with("data:image/png;base64,") {
                &icon[22..]
            } else if icon.starts_with("data:image/jpeg;base64,") {
                &icon[23..]
            } else {
                icon.as_str()
            };
            write_u8(&mut nbt_bytes, 8);
            write_string(&mut nbt_bytes, "icon");
            write_string(&mut nbt_bytes, raw_base64);
        }

        // Tag 'acceptTextures' (if set)
        if let Some(acc) = s.accept_textures {
            write_u8(&mut nbt_bytes, 1);
            write_string(&mut nbt_bytes, "acceptTextures");
            write_u8(&mut nbt_bytes, acc as u8);
        }

        // End of server compound
        write_u8(&mut nbt_bytes, 0);
    }

    // End of root compound
    write_u8(&mut nbt_bytes, 0);

    // Gzip compress NBT
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    std::io::Write::write_all(&mut encoder, &nbt_bytes).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;

    let path = servers_dat_path(game_dir);
    std::fs::write(&path, compressed)
        .map_err(|e| format!("Failed to write servers.dat {}: {}", path.display(), e))?;

    Ok(())
}

/// VarInt helpers for Minecraft Server List Ping protocol
fn write_varint(vec: &mut Vec<u8>, mut val: i32) {
    loop {
        let mut temp = (val & 0x7F) as u8;
        val >>= 7;
        if val != 0 {
            temp |= 0x80;
        }
        vec.push(temp);
        if val == 0 {
            break;
        }
    }
}

async fn read_varint<R: AsyncReadExt + Unpin>(reader: &mut R) -> Result<i32, String> {
    let mut num_read = 0;
    let mut result = 0;

    loop {
        let read = reader.read_u8().await.map_err(|e| e.to_string())?;
        let value = (read & 0x7F) as i32;
        result |= value << (7 * num_read);

        num_read += 1;
        if num_read > 5 {
            return Err("VarInt is too big".to_string());
        }

        if (read & 0x80) == 0 {
            break;
        }
    }

    Ok(result)
}

/// Asynchronously pings a Minecraft server to get live MOTD, player counts, latency, and favicon
pub async fn ping_server(address: &str) -> Result<ServerPingResult, String> {
    let parts: Vec<&str> = address.split(':').collect();
    let host = parts[0].trim();
    let port: u16 = if parts.len() > 1 {
        parts[1].trim().parse().unwrap_or(25565)
    } else {
        25565
    };

    let socket_addr = format!("{}:{}", host, port);
    let start_time = std::time::Instant::now();

    let connect_future = tokio::net::TcpStream::connect(&socket_addr);
    let mut stream = tokio::time::timeout(std::time::Duration::from_millis(3500), connect_future)
        .await
        .map_err(|_| "Connection timed out".to_string())?
        .map_err(|e| format!("Failed to connect to {}: {}", socket_addr, e))?;

    let ping_ms = start_time.elapsed().as_millis() as u64;

    // 1. Send Handshake packet (Packet ID: 0x00, Protocol: -1, Host, Port, Next State: 1)
    let mut handshake_data = Vec::new();
    write_varint(&mut handshake_data, 0x00); // Packet ID
    write_varint(&mut handshake_data, -1);   // Protocol version
    write_varint(&mut handshake_data, host.len() as i32);
    handshake_data.extend_from_slice(host.as_bytes());
    handshake_data.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake_data, 1);    // Next state: 1 (status)

    let mut handshake_packet = Vec::new();
    write_varint(&mut handshake_packet, handshake_data.len() as i32);
    handshake_packet.extend_from_slice(&handshake_data);

    stream.write_all(&handshake_packet).await.map_err(|e| e.to_string())?;

    // 2. Send Status Request packet (Packet ID: 0x00)
    let request_packet = [0x01, 0x00];
    stream.write_all(&request_packet).await.map_err(|e| e.to_string())?;

    // 3. Read Status Response
    let _packet_len = read_varint(&mut stream).await?;
    let packet_id = read_varint(&mut stream).await?;
    if packet_id != 0x00 {
        return Err(format!("Unexpected response packet ID: {}", packet_id));
    }

    let json_len = read_varint(&mut stream).await? as usize;
    let mut json_buf = vec![0u8; json_len];
    stream.read_exact(&mut json_buf).await.map_err(|e| e.to_string())?;

    let json_str = String::from_utf8_lossy(&json_buf);

    #[derive(Deserialize)]
    struct SlpResponse {
        version: Option<SlpVersion>,
        players: Option<SlpPlayers>,
        description: Option<serde_json::Value>,
        favicon: Option<String>,
    }

    #[derive(Deserialize)]
    struct SlpVersion {
        name: Option<String>,
        protocol: Option<i32>,
    }

    #[derive(Deserialize)]
    struct SlpPlayers {
        max: Option<u32>,
        online: Option<u32>,
    }

    let parsed: SlpResponse = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse status response: {}", e))?;

    let motd = match parsed.description {
        Some(serde_json::Value::String(s)) => strip_color_codes(&s),
        Some(serde_json::Value::Object(obj)) => {
            if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                strip_color_codes(t)
            } else {
                "A Minecraft Server".to_string()
            }
        }
        _ => "A Minecraft Server".to_string(),
    };

    Ok(ServerPingResult {
        motd,
        version_name: parsed.version.as_ref().and_then(|v| v.name.clone()).unwrap_or_else(|| "Unknown".to_string()),
        protocol: parsed.version.as_ref().and_then(|v| v.protocol).unwrap_or(0),
        players_online: parsed.players.as_ref().and_then(|p| p.online).unwrap_or(0),
        players_max: parsed.players.as_ref().and_then(|p| p.max).unwrap_or(0),
        ping_ms,
        favicon: parsed.favicon,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrips_servers_nbt() {
        let entries = vec![
            ServerEntry {
                id: "nomad.aak.bar".to_string(),
                name: "Nomad Survival".to_string(),
                ip: "nomad.aak.bar:25565".to_string(),
                icon: None,
                accept_textures: Some(1),
            },
        ];

        let temp_dir = std::env::temp_dir().join(format!("servers-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let res = write_servers_dat(&temp_dir, &entries);
        assert!(res.is_ok());

        let read_back = read_servers_dat(&temp_dir).unwrap();
        assert_eq!(read_back.len(), 1);
        assert_eq!(read_back[0].name, "Nomad Survival");
        assert_eq!(read_back[0].ip, "nomad.aak.bar:25565");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
