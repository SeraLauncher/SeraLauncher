use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldItem {
    pub folder_name: String,
    pub name: String,
    pub last_played: i64,
    pub game_type: String, // "Survival", "Creative", "Adventure", "Spectator", "Hardcore"
    pub difficulty: String, // "Peaceful", "Easy", "Normal", "Hard"
    pub hardcore: bool,
    pub version_name: Option<String>,
    pub size_bytes: u64,
    pub icon_data_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupItem {
    pub file_name: String,
    pub world_name: String,
    pub created_at: u64,
    pub size_bytes: u64,
}

#[derive(Default)]
struct ParsedLevelMeta {
    level_name: Option<String>,
    last_played: Option<i64>,
    game_type: Option<i32>,
    difficulty: Option<i32>,
    hardcore: Option<bool>,
    version_name: Option<String>,
}

/// Recursively calculates total byte size of a folder
fn calculate_dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += p.metadata().map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += calculate_dir_size(&p);
            }
        }
    }
    total
}

fn encode_png_base64_data_url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 {
            chunk[1] as usize
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            chunk[2] as usize
        } else {
            0
        };

        encoded.push(ALPHABET[(b0 >> 2) & 0x3F] as char);
        encoded.push(ALPHABET[((b0 << 4) | (b1 >> 4)) & 0x3F] as char);
        if chunk.len() > 1 {
            encoded.push(ALPHABET[((b1 << 2) | (b2 >> 6)) & 0x3F] as char);
        } else {
            encoded.push('=');
        }
        if chunk.len() > 2 {
            encoded.push(ALPHABET[b2 & 0x3F] as char);
        } else {
            encoded.push('=');
        }
    }
    format!("data:image/png;base64,{}", encoded)
}

/// Lightweight, resilient NBT binary parser targeting Minecraft level.dat fields
fn parse_nbt_level_dat(data: &[u8]) -> ParsedLevelMeta {
    let mut meta = ParsedLevelMeta::default();
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

    fn read_i64(data: &[u8], cursor: &mut usize) -> Option<i64> {
        if *cursor + 8 <= data.len() {
            let mut arr = [0u8; 8];
            arr.copy_from_slice(&data[*cursor..*cursor + 8]);
            *cursor += 8;
            Some(i64::from_be_bytes(arr))
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
            1 => {
                *cursor += 1;
                true
            } // Byte
            2 => {
                *cursor += 2;
                true
            } // Short
            3 => {
                *cursor += 4;
                true
            } // Int
            4 => {
                *cursor += 8;
                true
            } // Long
            5 => {
                *cursor += 4;
                true
            } // Float
            6 => {
                *cursor += 8;
                true
            } // Double
            7 => {
                // Byte Array
                if let Some(len) = read_i32(data, cursor) {
                    *cursor += len.max(0) as usize;
                    true
                } else {
                    false
                }
            }
            8 => {
                // String
                if let Some(len) = read_i16(data, cursor) {
                    *cursor += len.max(0) as usize;
                    true
                } else {
                    false
                }
            }
            9 => {
                // List
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
                // Compound
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
            11 => {
                // Int Array
                if let Some(len) = read_i32(data, cursor) {
                    *cursor += (len.max(0) as usize) * 4;
                    true
                } else {
                    false
                }
            }
            12 => {
                // Long Array
                if let Some(len) = read_i32(data, cursor) {
                    *cursor += (len.max(0) as usize) * 8;
                    true
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    fn parse_compound(data: &[u8], cursor: &mut usize, meta: &mut ParsedLevelMeta, in_data: bool) {
        loop {
            let tag = match read_u8(data, cursor) {
                Some(t) => t,
                None => break,
            };
            if tag == 0 {
                break;
            }

            let name = match read_string(data, cursor) {
                Some(n) => n,
                None => break,
            };

            let is_data_subcompound = !in_data && name == "Data";

            if tag == 10 {
                // Compound
                if is_data_subcompound {
                    parse_compound(data, cursor, meta, true);
                } else if in_data && name == "Version" {
                    parse_version_compound(data, cursor, meta);
                } else {
                    let _ = skip_payload(10, data, cursor);
                }
                continue;
            }

            if in_data {
                match name.as_str() {
                    "LevelName" if tag == 8 => {
                        meta.level_name = read_string(data, cursor);
                    }
                    "LastPlayed" if tag == 4 => {
                        meta.last_played = read_i64(data, cursor);
                    }
                    "GameType" if tag == 3 => {
                        meta.game_type = read_i32(data, cursor);
                    }
                    "Difficulty" if tag == 1 => {
                        meta.difficulty = read_i8(data, cursor).map(|d| d as i32);
                    }
                    "hardcore" | "Hardcore" if tag == 1 => {
                        meta.hardcore = read_i8(data, cursor).map(|b| b == 1);
                    }
                    _ => {
                        let _ = skip_payload(tag, data, cursor);
                    }
                }
            } else {
                let _ = skip_payload(tag, data, cursor);
            }
        }
    }

    fn parse_version_compound(data: &[u8], cursor: &mut usize, meta: &mut ParsedLevelMeta) {
        loop {
            let tag = match read_u8(data, cursor) {
                Some(t) => t,
                None => break,
            };
            if tag == 0 {
                break;
            }
            let name = match read_string(data, cursor) {
                Some(n) => n,
                None => break,
            };
            if name == "Name" && tag == 8 {
                meta.version_name = read_string(data, cursor);
            } else {
                let _ = skip_payload(tag, data, cursor);
            }
        }
    }

    // Root tag must be compound (0x0A)
    if let Some(10) = read_u8(data, &mut cursor) {
        let _ = read_string(data, &mut cursor); // Root compound name (usually "")
        parse_compound(data, &mut cursor, &mut meta, false);
    }

    meta
}

/// Reads level.dat from a world directory and extracts metadata
pub fn inspect_world_save(world_dir: &Path) -> Result<WorldItem, String> {
    let folder_name = world_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let level_dat_path = world_dir.join("level.dat");
    let mut meta = ParsedLevelMeta::default();

    if level_dat_path.is_file() {
        if let Ok(file) = File::open(&level_dat_path) {
            let mut gz = flate2::read::GzDecoder::new(file);
            let mut decompressed = Vec::new();
            if gz.read_to_end(&mut decompressed).is_ok() {
                meta = parse_nbt_level_dat(&decompressed);
            }
        }
    }

    let name = meta.level_name.unwrap_or_else(|| folder_name.clone());
    let last_played = meta.last_played.unwrap_or_else(|| {
        std::fs::metadata(world_dir)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    });

    let is_hardcore = meta.hardcore.unwrap_or(false);
    let game_type = if is_hardcore {
        "Hardcore".to_string()
    } else {
        match meta.game_type.unwrap_or(0) {
            1 => "Creative".to_string(),
            2 => "Adventure".to_string(),
            3 => "Spectator".to_string(),
            _ => "Survival".to_string(),
        }
    };

    let difficulty = match meta.difficulty.unwrap_or(2) {
        0 => "Peaceful".to_string(),
        1 => "Easy".to_string(),
        3 => "Hard".to_string(),
        _ => "Normal".to_string(),
    };

    let size_bytes = calculate_dir_size(world_dir);

    // Read icon.png if present
    let icon_path = world_dir.join("icon.png");
    let icon_data_url = if icon_path.is_file() {
        std::fs::read(&icon_path)
            .ok()
            .map(|bytes| encode_png_base64_data_url(&bytes))
    } else {
        None
    };

    Ok(WorldItem {
        folder_name,
        name,
        last_played,
        game_type,
        difficulty,
        hardcore: is_hardcore,
        version_name: meta.version_name,
        size_bytes,
        icon_data_url,
    })
}

/// Returns a list of all singleplayer worlds in an instance
pub fn list_instance_worlds(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<Vec<WorldItem>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let saves_dir = crate::instances::get_instance_game_dir(&inst_dir).join("saves");

    if !saves_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut worlds = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&saves_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("level.dat").exists() {
                if let Ok(item) = inspect_world_save(&path) {
                    worlds.push(item);
                }
            }
        }
    }

    // Sort by most recently played
    worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    Ok(worlds)
}

/// Creates a ZIP backup of a world directory into <instance>/minecraft/backups/
pub fn create_world_backup(
    app: &tauri::AppHandle,
    instance_id: &str,
    folder_name: &str,
) -> Result<WorldBackupItem, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    let world_dir = mc_dir.join("saves").join(folder_name);

    if !world_dir.is_dir() {
        return Err(format!("World directory does not exist: {}", folder_name));
    }

    let backups_dir = mc_dir.join("backups");
    let _ = std::fs::create_dir_all(&backups_dir);

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let backup_file_name = format!("{}_{}.zip", folder_name, now_secs);
    let backup_path = backups_dir.join(&backup_file_name);

    let file = File::create(&backup_path).map_err(|e| {
        format!(
            "Failed to create backup archive {}: {}",
            backup_path.display(),
            e
        )
    })?;

    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    fn add_dir_to_zip<W: std::io::Write + std::io::Seek>(
        zip: &mut zip::ZipWriter<W>,
        base_dir: &Path,
        current_dir: &Path,
        prefix: &str,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(current_dir)
            .map_err(|e| format!("Failed to read dir {}: {}", current_dir.display(), e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let rel = path
                .strip_prefix(base_dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");

            let zip_entry_name = if prefix.is_empty() {
                rel
            } else {
                format!("{}/{}", prefix.trim_end_matches('/'), rel)
            };

            if path.is_file() {
                zip.start_file(&zip_entry_name, options)
                    .map_err(|e| format!("Failed to add file entry to zip: {}", e))?;
                let mut f = File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
            } else if path.is_dir() {
                add_dir_to_zip(zip, base_dir, &path, prefix, options)?;
            }
        }
        Ok(())
    }

    add_dir_to_zip(&mut zip, &world_dir, &world_dir, folder_name, options)?;
    zip.finish()
        .map_err(|e| format!("Failed to finalize backup archive: {}", e))?;

    let size_bytes = std::fs::metadata(&backup_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(WorldBackupItem {
        file_name: backup_file_name,
        world_name: folder_name.to_string(),
        created_at: now_secs,
        size_bytes,
    })
}

/// Lists all ZIP backups inside <instance>/minecraft/backups/
pub fn list_world_backups(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<Vec<WorldBackupItem>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let backups_dir = crate::instances::get_instance_game_dir(&inst_dir).join("backups");

    if !backups_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("zip") {
                let fname = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();

                let metadata = path.metadata().ok();
                let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let created_at = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let world_name = fname
                    .rsplit_once('_')
                    .map(|(w, _)| w)
                    .unwrap_or_else(|| fname.trim_end_matches(".zip"))
                    .to_string();

                backups.push(WorldBackupItem {
                    file_name: fname,
                    world_name,
                    created_at,
                    size_bytes,
                });
            }
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

/// Restores a backup ZIP back into <instance>/minecraft/saves/
pub fn restore_world_backup(
    app: &tauri::AppHandle,
    instance_id: &str,
    backup_file_name: &str,
) -> Result<(), String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    let backup_file = mc_dir.join("backups").join(backup_file_name);

    if !backup_file.is_file() {
        return Err(format!("Backup archive not found: {}", backup_file_name));
    }

    let file =
        File::open(&backup_file).map_err(|e| format!("Failed to open backup archive: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read backup zip: {}", e))?;

    let saves_dir = mc_dir.join("saves");
    let _ = std::fs::create_dir_all(&saves_dir);

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        let outpath = match f.enclosed_name() {
            Some(p) => saves_dir.join(p),
            None => continue,
        };

        if name.ends_with('/') || f.is_dir() {
            let _ = std::fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Deletes a world backup file permanently
pub fn delete_world_backup(
    app: &tauri::AppHandle,
    instance_id: &str,
    backup_file_name: &str,
) -> Result<(), String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let backup_file = crate::instances::get_instance_game_dir(&inst_dir)
        .join("backups")
        .join(backup_file_name);

    if backup_file.is_file() {
        std::fs::remove_file(&backup_file)
            .map_err(|e| format!("Failed to delete backup file: {}", e))?;
    }
    Ok(())
}

/// Deletes a world save folder permanently
pub fn delete_world_save(
    app: &tauri::AppHandle,
    instance_id: &str,
    folder_name: &str,
) -> Result<(), String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let world_dir = crate::instances::get_instance_game_dir(&inst_dir)
        .join("saves")
        .join(folder_name);

    if world_dir.is_dir() {
        std::fs::remove_dir_all(&world_dir)
            .map_err(|e| format!("Failed to delete world save folder: {}", e))?;
    }
    Ok(())
}

/// Recursively copies a directory to a new target path
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Duplicates a singleplayer world save folder to allow risk-free modding and experimentation
pub fn clone_world_save(
    app: &tauri::AppHandle,
    instance_id: &str,
    folder_name: &str,
) -> Result<WorldItem, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let saves_dir = crate::instances::get_instance_game_dir(&inst_dir).join("saves");
    let src_dir = saves_dir.join(folder_name);

    if !src_dir.is_dir() {
        return Err(format!("World {} does not exist", folder_name));
    }

    // Determine unique clone folder name
    let mut counter = 1;
    let mut candidate_name = format!("{}_Copy", folder_name);
    while saves_dir.join(&candidate_name).exists() {
        counter += 1;
        candidate_name = format!("{}_Copy_{}", folder_name, counter);
    }

    let target_dir = saves_dir.join(&candidate_name);
    copy_dir_all(&src_dir, &target_dir).map_err(|e| format!("Failed to clone world: {}", e))?;

    inspect_world_save(&target_dir)
}

/// Imports an external world ZIP archive into <instance>/minecraft/saves/
pub fn import_world_zip(
    app: &tauri::AppHandle,
    instance_id: &str,
    zip_path: &str,
) -> Result<WorldItem, String> {
    let resolved = crate::modpack::resolve_archive_path(zip_path);
    if !resolved.is_file() {
        return Err(format!("World archive not found: {}", resolved.display()));
    }

    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let saves_dir = crate::instances::get_instance_game_dir(&inst_dir).join("saves");
    let _ = std::fs::create_dir_all(&saves_dir);

    let file = File::open(&resolved).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Determine target folder name from zip stem
    let stem = resolved
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported_World");

    // Check if zip contains a root world folder or if contents are flat
    let has_root_level_dat = archive.by_name("level.dat").is_ok();
    let target_dir = if has_root_level_dat {
        saves_dir.join(stem)
    } else {
        // Find folder containing level.dat
        let mut level_dat_parent = None;
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                if entry.name().ends_with("level.dat") {
                    let parts: Vec<&str> = entry.name().split('/').collect();
                    if parts.len() >= 2 {
                        level_dat_parent = Some(parts[0].to_string());
                        break;
                    }
                }
            }
        }
        let folder = level_dat_parent.unwrap_or_else(|| stem.to_string());
        saves_dir.join(folder)
    };

    let _ = std::fs::create_dir_all(&target_dir);

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();

        let outpath = if has_root_level_dat {
            target_dir.join(&name)
        } else {
            // strip possible parent if target_dir already matches
            saves_dir.join(&name)
        };

        if name.ends_with('/') || f.is_dir() {
            let _ = std::fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            if let Ok(mut dest) = File::create(&outpath) {
                let _ = std::io::copy(&mut f, &mut dest);
            }
        }
    }

    inspect_world_save(&target_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_synthetic_nbt_level_dat() {
        // Construct small valid NBT compound with LevelName and GameType
        let mut nbt_bytes = Vec::new();
        nbt_bytes.push(10); // TAG_Compound
        nbt_bytes.extend_from_slice(&0u16.to_be_bytes()); // root name ""

        // Subcompound "Data"
        nbt_bytes.push(10); // TAG_Compound
        nbt_bytes.extend_from_slice(&(4u16).to_be_bytes());
        nbt_bytes.extend_from_slice(b"Data");

        // String "LevelName" = "Test World"
        nbt_bytes.push(8); // TAG_String
        nbt_bytes.extend_from_slice(&(9u16).to_be_bytes());
        nbt_bytes.extend_from_slice(b"LevelName");
        nbt_bytes.extend_from_slice(&(10u16).to_be_bytes());
        nbt_bytes.extend_from_slice(b"Test World");

        // Int "GameType" = 1 (Creative)
        nbt_bytes.push(3); // TAG_Int
        nbt_bytes.extend_from_slice(&(8u16).to_be_bytes());
        nbt_bytes.extend_from_slice(b"GameType");
        nbt_bytes.extend_from_slice(&(1i32).to_be_bytes());

        // Byte "Difficulty" = 2 (Normal)
        nbt_bytes.push(1); // TAG_Byte
        nbt_bytes.extend_from_slice(&(10u16).to_be_bytes());
        nbt_bytes.extend_from_slice(b"Difficulty");
        nbt_bytes.push(2);

        // End of Data compound
        nbt_bytes.push(0); // TAG_End

        // End of root compound
        nbt_bytes.push(0); // TAG_End

        let meta = parse_nbt_level_dat(&nbt_bytes);
        assert_eq!(meta.level_name.as_deref(), Some("Test World"));
        assert_eq!(meta.game_type, Some(1));
        assert_eq!(meta.difficulty, Some(2));
    }
}
