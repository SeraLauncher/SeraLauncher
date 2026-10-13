use std::fs::File;
use std::io::{Cursor, Read, Seek};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use tauri::Emitter;
use tokio::sync::Semaphore;

use crate::discovery::{write_addon_index, DEFAULT_CURSEFORGE_KEY};
use crate::downloads::{get_or_create_controller, is_download_stopped, DownloadItem};
use crate::instances::{create_instance, get_instance_game_dir, Instance};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackInspection {
    pub name: String,
    pub summary: Option<String>,
    pub mc_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub file_count: usize,
    pub format: String, // "mrpack" | "curseforge"
}

#[derive(Clone, Debug)]
pub struct ModpackFileEntry {
    pub download_url: String,
    pub relative_path: PathBuf,
    pub size: Option<u64>,
    pub sha1: Option<String>,
    pub project_id: Option<String>,
    pub file_id: Option<String>,
    pub file_name: String,
}

pub struct ModpackManifest {
    pub name: String,
    pub summary: Option<String>,
    pub mc_version: String,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub files: Vec<ModpackFileEntry>,
    pub overrides_prefix: String,
}

// Modrinth mrpack schema
#[derive(Deserialize)]
struct MrpackIndex {
    name: String,
    summary: Option<String>,
    game: Option<String>,
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<MrpackFile>,
}

#[derive(Deserialize)]
struct MrpackFile {
    path: String,
    hashes: std::collections::HashMap<String, String>,
    downloads: Vec<String>,
    file_size: Option<u64>,
}

// CurseForge manifest schema
#[derive(Deserialize)]
struct CurseForgeManifest {
    name: String,
    #[allow(dead_code)]
    version: Option<String>,
    #[allow(dead_code)]
    author: Option<String>,
    minecraft: CurseForgeMinecraftMeta,
    files: Vec<CurseForgeManifestFile>,
    #[serde(default = "default_overrides")]
    overrides: String,
}

// Prism Launcher / MultiMC mmc-pack.json schema
#[derive(Deserialize)]
struct MmcPackJson {
    components: Vec<MmcComponent>,
}

#[derive(Deserialize)]
struct MmcComponent {
    uid: String,
    version: Option<String>,
    #[serde(rename = "cachedVersion")]
    cached_version: Option<String>,
}

fn default_overrides() -> String {
    "overrides".to_string()
}

#[derive(Deserialize)]
struct CurseForgeMinecraftMeta {
    version: String,
    #[serde(rename = "modLoaders")]
    mod_loaders: Vec<CurseForgeModLoaderMeta>,
}

#[derive(Deserialize)]
struct CurseForgeModLoaderMeta {
    id: String,
    #[allow(dead_code)]
    primary: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeSingleFileResponse {
    data: CurseForgeFileData,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFileData {
    #[allow(dead_code)]
    id: u64,
    file_name: String,
    file_length: Option<u64>,
    download_url: Option<String>,
    hashes: Option<Vec<CurseForgeFileHash>>,
}

#[derive(Deserialize)]
struct CurseForgeFileHash {
    value: String,
    algo: u32, // 1 = sha1, 2 = md5
}

/// Parses a Modrinth .mrpack index from an open zip archive
pub fn parse_mrpack<R: Read + Seek>(archive: &mut zip::ZipArchive<R>) -> Result<ModpackManifest, String> {
    let mut index_file = archive
        .by_name("modrinth.index.json")
        .map_err(|e| format!("Missing modrinth.index.json in mrpack: {}", e))?;

    let mut content = String::new();
    index_file
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read modrinth.index.json: {}", e))?;

    let parsed: MrpackIndex = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid modrinth.index.json format: {}", e))?;

    if parsed.game.as_deref().unwrap_or("minecraft") != "minecraft" {
        return Err("Unsupported mrpack game type (expected minecraft)".to_string());
    }

    let mc_version = parsed
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| "Modpack missing minecraft version dependency".to_string())?;

    // Determine loader from dependencies
    let mut loader: Option<String> = None;
    let mut loader_version: Option<String> = None;

    for (k, v) in &parsed.dependencies {
        let lower = k.to_lowercase();
        if lower.contains("fabric-loader") || lower == "fabric" {
            loader = Some("fabric".to_string());
            loader_version = Some(v.clone());
            break;
        } else if lower.contains("quilt-loader") || lower == "quilt" {
            loader = Some("quilt".to_string());
            loader_version = Some(v.clone());
            break;
        } else if lower.contains("neoforge") {
            loader = Some("neoforge".to_string());
            loader_version = Some(v.clone());
            break;
        } else if lower.contains("forge") {
            loader = Some("forge".to_string());
            loader_version = Some(v.clone());
            break;
        }
    }

    let files = parsed
        .files
        .into_iter()
        .filter_map(|f| {
            let primary_url = f.downloads.into_iter().next()?;
            let rel = PathBuf::from(&f.path);
            let sha1 = f.hashes.get("sha1").cloned();
            let file_name = rel
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unnamed.jar")
                .to_string();

            Some(ModpackFileEntry {
                download_url: primary_url,
                relative_path: rel,
                size: f.file_size,
                sha1,
                project_id: None,
                file_id: None,
                file_name,
            })
        })
        .collect();

    Ok(ModpackManifest {
        name: parsed.name,
        summary: parsed.summary,
        mc_version,
        loader,
        loader_version,
        files,
        overrides_prefix: "overrides".to_string(),
    })
}

/// Parses a CurseForge modpack manifest.json from an open zip archive
pub async fn parse_curseforge<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    client: &reqwest::Client,
) -> Result<ModpackManifest, String> {
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|e| format!("Missing manifest.json in CurseForge zip: {}", e))?;

    let mut content = String::new();
    manifest_file
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read manifest.json: {}", e))?;

    let parsed: CurseForgeManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid manifest.json format: {}", e))?;

    let mc_version = parsed.minecraft.version;

    // Parse loader identifier e.g. "fabric-0.15.11" or "forge-47.2.0"
    let mut loader: Option<String> = None;
    let mut loader_version: Option<String> = None;

    if let Some(first_loader) = parsed.minecraft.mod_loaders.first() {
        let parts: Vec<&str> = first_loader.id.split('-').collect();
        if parts.len() >= 2 {
            let ldr = parts[0].to_lowercase();
            loader = Some(ldr);
            loader_version = Some(parts[1..].join("-"));
        } else {
            loader = Some(first_loader.id.to_lowercase());
        }
    }

    // Resolve CurseForge files
    let mut files = Vec::new();

    for cf_file in parsed.files {
        let project_id = cf_file.project_id;
        let file_id = cf_file.file_id;

        // Fetch direct file metadata from CurseForge API
        let url = format!("https://api.curseforge.com/v1/mods/{}/files/{}", project_id, file_id);
        let resp = client
            .get(&url)
            .header("x-api-key", DEFAULT_CURSEFORGE_KEY)
            .send()
            .await;

        let mut dl_url = None;
        let mut file_name = format!("curseforge-{}-{}.jar", project_id, file_id);
        let mut file_size = None;
        let mut sha1_hash = None;

        if let Ok(res) = resp {
            if let Ok(data) = res.json::<CurseForgeSingleFileResponse>().await {
                file_name = data.data.file_name.clone();
                file_size = data.data.file_length;
                if let Some(hashes) = data.data.hashes {
                    for h in hashes {
                        if h.algo == 1 {
                            sha1_hash = Some(h.value);
                            break;
                        }
                    }
                }
                dl_url = data.data.download_url;
            }
        }

        // Edge CDN fallback if direct download URL is null or blocked
        let final_url = dl_url.unwrap_or_else(|| {
            format!(
                "https://edge.forgecdn.net/files/{}/{}/{}",
                file_id / 1000,
                file_id % 1000,
                file_name
            )
        });

        let rel_path = PathBuf::from("mods").join(&file_name);
        files.push(ModpackFileEntry {
            download_url: final_url,
            relative_path: rel_path,
            size: file_size,
            sha1: sha1_hash,
            project_id: Some(project_id.to_string()),
            file_id: Some(file_id.to_string()),
            file_name,
        });
    }

    Ok(ModpackManifest {
        name: parsed.name,
        summary: None,
        mc_version,
        loader,
        loader_version,
        files,
        overrides_prefix: parsed.overrides,
    })
}

/// Resolves a file path string, expanding tilde (~) and checking common user directories
pub fn resolve_archive_path(path_str: &str) -> PathBuf {
    let trimmed = path_str.trim().trim_matches('"').trim_matches('\'');
    let home = std::env::var("HOME").ok().map(PathBuf::from);

    let expanded: PathBuf = if let Some(h) = &home {
        if trimmed.starts_with("~/") {
            h.join(trimmed.trim_start_matches("~/"))
        } else if trimmed == "~" {
            h.clone()
        } else {
            PathBuf::from(trimmed)
        }
    } else {
        PathBuf::from(trimmed)
    };

    if expanded.exists() {
        return expanded;
    }

    // If bare filename, check common user download locations
    if let Some(h) = &home {
        let dl_candidate = h.join("Downloads").join(trimmed);
        if dl_candidate.exists() {
            return dl_candidate;
        }

        let mc_candidate = h.join("Downloads").join("MC").join(trimmed);
        if mc_candidate.exists() {
            return mc_candidate;
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let cwd_candidate = cwd.join(trimmed);
        if cwd_candidate.exists() {
            return cwd_candidate;
        }
    }

    expanded
}

/// Parses a Prism Launcher / MultiMC archive (mmc-pack.json or instance.cfg)
pub fn parse_prism<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    fallback_name: &str,
) -> Result<ModpackManifest, String> {
    let mut mc_version = None;
    let mut loader = None;
    let mut loader_version = None;

    if let Ok(mut pack_file) = archive.by_name("mmc-pack.json") {
        let mut content = String::new();
        if pack_file.read_to_string(&mut content).is_ok() {
            if let Ok(parsed) = serde_json::from_str::<MmcPackJson>(&content) {
                for c in parsed.components {
                    let ver = c.version.or(c.cached_version).unwrap_or_default();
                    match c.uid.as_str() {
                        "net.minecraft" => mc_version = Some(ver),
                        "net.fabricmc.fabric-loader" => {
                            loader = Some("fabric".to_string());
                            loader_version = Some(ver);
                        }
                        "net.minecraftforge" => {
                            loader = Some("forge".to_string());
                            loader_version = Some(ver);
                        }
                        "net.neoforged" => {
                            loader = Some("neoforge".to_string());
                            loader_version = Some(ver);
                        }
                        "org.quiltmc.quilt-loader" => {
                            loader = Some("quilt".to_string());
                            loader_version = Some(ver);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let mc_ver = mc_version.ok_or_else(|| "Could not find Minecraft version in mmc-pack.json".to_string())?;

    // Parse instance name from instance.cfg if available
    let mut name = fallback_name.to_string();
    if let Ok(mut cfg_file) = archive.by_name("instance.cfg") {
        let mut content = String::new();
        if cfg_file.read_to_string(&mut content).is_ok() {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("name=") || trimmed.starts_with("ExportName=") {
                    let val = trimmed.split('=').nth(1).unwrap_or("").trim();
                    if !val.is_empty() {
                        name = val.to_string();
                        break;
                    }
                }
            }
        }
    }

    // Count mod files inside minecraft/mods/
    let mut mod_count = 0;
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let fname = file.name();
            if fname.starts_with("minecraft/mods/") && fname.ends_with(".jar") && !file.is_dir() {
                mod_count += 1;
            }
        }
    }

    Ok(ModpackManifest {
        name,
        summary: Some(format!("Prism Launcher instance with {} mods", mod_count)),
        mc_version: mc_ver,
        loader,
        loader_version,
        files: Vec::new(), // mods already bundled in archive
        overrides_prefix: "minecraft".to_string(),
    })
}

#[derive(Deserialize)]
struct CurseForgeManifestFile {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(rename = "fileID")]
    file_id: u64,
}

/// Inspects a modpack file path and returns human-readable summary without extracting
pub async fn inspect_modpack_file(file_path: &Path) -> Result<ModpackInspection, String> {
    let resolved_path = resolve_archive_path(&file_path.to_string_lossy());
    let file = File::open(&resolved_path)
        .map_err(|e| format!("Could not open file {}: {}", resolved_path.display(), e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("File is not a valid zip archive: {}", e))?;

    let is_mrpack = archive.by_name("modrinth.index.json").is_ok();
    let is_curseforge = archive.by_name("manifest.json").is_ok();
    let is_prism = archive.by_name("mmc-pack.json").is_ok() || archive.by_name("instance.cfg").is_ok();

    if is_mrpack {
        let manifest = parse_mrpack(&mut archive)?;
        Ok(ModpackInspection {
            name: manifest.name,
            summary: manifest.summary,
            mc_version: manifest.mc_version,
            loader: manifest.loader,
            loader_version: manifest.loader_version,
            file_count: manifest.files.len(),
            format: "mrpack".to_string(),
        })
    } else if is_curseforge {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|e| format!("Missing manifest.json: {}", e))?;
        let mut content = String::new();
        manifest_file
            .read_to_string(&mut content)
            .map_err(|e| format!("Failed to read manifest.json: {}", e))?;
        let parsed: CurseForgeManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Invalid manifest.json: {}", e))?;

        let mut loader = None;
        let mut loader_version = None;
        if let Some(first_loader) = parsed.minecraft.mod_loaders.first() {
            let parts: Vec<&str> = first_loader.id.split('-').collect();
            if parts.len() >= 2 {
                loader = Some(parts[0].to_lowercase());
                loader_version = Some(parts[1..].join("-"));
            } else {
                loader = Some(first_loader.id.to_lowercase());
            }
        }

        Ok(ModpackInspection {
            name: parsed.name,
            summary: None,
            mc_version: parsed.minecraft.version,
            loader,
            loader_version,
            file_count: parsed.files.len(),
            format: "curseforge".to_string(),
        })
    } else if is_prism {
        let fallback_stem = resolved_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Prism Instance");
        let manifest = parse_prism(&mut archive, fallback_stem)?;
        let mod_count = archive.len();
        Ok(ModpackInspection {
            name: manifest.name,
            summary: manifest.summary,
            mc_version: manifest.mc_version,
            loader: manifest.loader,
            loader_version: manifest.loader_version,
            file_count: mod_count,
            format: "prism".to_string(),
        })
    } else {
        Err("Unsupported modpack format (neither modrinth.index.json, manifest.json, nor mmc-pack.json found)".to_string())
    }
}

/// Installs a modpack archive bytes into a new dedicated instance
pub async fn install_modpack_bytes(
    app: &tauri::AppHandle,
    archive_bytes: &[u8],
    custom_name: Option<String>,
    custom_icon: Option<String>,
) -> Result<Instance, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let cursor = Cursor::new(archive_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Invalid zip archive: {}", e))?;

    let is_mrpack = archive.by_name("modrinth.index.json").is_ok();
    let is_curseforge = archive.by_name("manifest.json").is_ok();
    let is_prism = archive.by_name("mmc-pack.json").is_ok() || archive.by_name("instance.cfg").is_ok();

    let manifest = if is_mrpack {
        parse_mrpack(&mut archive)?
    } else if is_curseforge {
        parse_curseforge(&mut archive, &client).await?
    } else if is_prism {
        let fallback = custom_name.as_deref().unwrap_or("Prism Instance");
        parse_prism(&mut archive, fallback)?
    } else {
        return Err("Archive is neither a Modrinth .mrpack, CurseForge modpack, nor Prism export".to_string());
    };

    let instance_name = custom_name.unwrap_or(manifest.name.clone());
    let icon = custom_icon.or_else(|| Some("grass_block:sunset_pastel".to_string()));

    // 1. Provision clean instance
    let instance = create_instance(
        app,
        instance_name.clone(),
        manifest.mc_version.clone(),
        Some("release".to_string()),
        icon,
        manifest.loader.clone(),
        manifest.loader_version.clone(),
    )
    .await?;

    let inst_game_dir = get_instance_game_dir(&crate::paths::instances_dir(app)?.join(&instance.id));

    // 2. Register download task in launcher downloads drawer
    let task_id = format!("modpack-{}", instance.id);
    let _ = get_or_create_controller(&task_id);

    let total_files = manifest.files.len();
    let total_bytes: u64 = manifest.files.iter().filter_map(|f| f.size).sum();

    let initial_item = DownloadItem {
        id: task_id.clone(),
        title: format!("Installing {}", manifest.name),
        phase: "modpack".to_string(),
        phase_label: format!("Downloading mods (0/{})", total_files),
        downloaded_bytes: 0,
        total_bytes: if total_bytes > 0 { Some(total_bytes) } else { None },
        speed_bytes_per_sec: 0,
        progress: 0.0,
        status: "downloading".to_string(),
        error: None,
        order: 1,
        instance_name: Some(instance_name.clone()),
        instance_icon: instance.icon.clone(),
    };

    if let Ok(mut guard) = crate::downloads::ACTIVE_DOWNLOADS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        list.retain(|d| d.id != task_id);
        list.push(initial_item);
        let _ = app.emit("downloads_changed", list.clone());
    }

    // 3. Concurrently download all mod files with semaphore (bounded to 6 parallel connections)
    let semaphore = Arc::new(Semaphore::new(6));
    let downloaded_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let downloaded_bytes_total = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let mut download_handles = Vec::new();

    for file in manifest.files {
        let sem = semaphore.clone();
        let cli = client.clone();
        let target_path = inst_game_dir.join(&file.relative_path);
        let count_clone = downloaded_count.clone();
        let bytes_clone = downloaded_bytes_total.clone();
        let app_clone = app.clone();
        let task_id_clone = task_id.clone();
        let total_b = total_bytes;
        let tot_files = total_files;

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

            if is_download_stopped(&task_id_clone) {
                return Err("Download canceled".to_string());
            }

            if let Some(parent) = target_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            let resp = cli.get(&file.download_url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("HTTP {} fetching {}", resp.status(), file.file_name));
            }

            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

            // Integrity check if SHA1 is provided
            if let Some(expected_sha1) = &file.sha1 {
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let computed: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
                if !computed.eq_ignore_ascii_case(expected_sha1) {
                    return Err(format!("SHA1 mismatch for {}: expected {}, got {}", file.file_name, expected_sha1, computed));
                }
            }

            std::fs::write(&target_path, &bytes).map_err(|e| e.to_string())?;

            // Write addon index for mod management
            if let Some(parent) = target_path.parent() {
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let hex_sha1: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
                write_addon_index(
                    parent,
                    &file.file_name,
                    "mod",
                    &file.download_url,
                    Some("modpack"),
                    file.project_id.as_deref(),
                    file.file_id.as_deref(),
                    &hex_sha1,
                    bytes.len() as u64,
                );
            }

            let curr_count = count_clone.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            let curr_bytes = bytes_clone.fetch_add(bytes.len() as u64, std::sync::atomic::Ordering::Relaxed) + bytes.len() as u64;

            // Emit progress
            if let Ok(mut guard) = crate::downloads::ACTIVE_DOWNLOADS.lock() {
                if let Some(list) = guard.as_mut() {
                    if let Some(item) = list.iter_mut().find(|d| d.id == task_id_clone) {
                        item.downloaded_bytes = curr_bytes;
                        item.phase_label = format!("Downloading mods ({}/{})", curr_count, tot_files);
                        let prog = if total_b > 0 {
                            ((curr_bytes as f64 / total_b as f64) * 90.0).min(90.0)
                        } else {
                            ((curr_count as f64 / tot_files as f64) * 90.0).min(90.0)
                        };
                        item.progress = prog;
                    }
                    let _ = app_clone.emit("downloads_changed", list.clone());
                }
            }

            Ok::<(), String>(())
        });

        download_handles.push(handle);
    }

    // Wait for all mod downloads
    for h in download_handles {
        if let Ok(res) = h.await {
            res?;
        }
    }

    // 4. Extract overrides into <instance>/minecraft/
    let cursor_overrides = Cursor::new(archive_bytes);
    if let Ok(mut archive_overrides) = zip::ZipArchive::new(cursor_overrides) {
        let prefix = format!("{}/", manifest.overrides_prefix.trim_end_matches('/'));
        let client_prefix = "client-overrides/";

        for i in 0..archive_overrides.len() {
            if let Ok(mut file) = archive_overrides.by_index(i) {
                let name = file.name().to_string();
                let sub_path = if name.starts_with(&prefix) {
                    Some(&name[prefix.len()..])
                } else if name.starts_with(client_prefix) {
                    Some(&name[client_prefix.len()..])
                } else {
                    None
                };

                if let Some(rel) = sub_path {
                    if !rel.trim().is_empty() {
                        let out = inst_game_dir.join(rel);
                        if file.is_dir() {
                            let _ = std::fs::create_dir_all(&out);
                        } else {
                            if let Some(p) = out.parent() {
                                let _ = std::fs::create_dir_all(p);
                            }
                            if let Ok(mut dest) = File::create(&out) {
                                let _ = std::io::copy(&mut file, &mut dest);
                            }
                        }
                    }
                }
            }
        }
    }

    // Index bundled mods if present (e.g. Prism instance exports)
    let mods_dir = inst_game_dir.join("mods");
    if mods_dir.is_dir() {
        let scanned = crate::discovery::scan_installed_mods(&mods_dir);
        for (stem, (ver, path)) in scanned {
            if let Some(fname) = path.file_name().and_then(|s| s.to_str()) {
                write_addon_index(
                    &mods_dir,
                    fname,
                    "mod",
                    "",
                    Some("archive"),
                    Some(&stem),
                    Some(&ver),
                    "",
                    std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
                );
            }
        }
    }

    // 5. Complete download item
    if let Ok(mut guard) = crate::downloads::ACTIVE_DOWNLOADS.lock() {
        if let Some(list) = guard.as_mut() {
            if let Some(item) = list.iter_mut().find(|d| d.id == task_id) {
                item.status = "completed".to_string();
                item.progress = 100.0;
                item.phase_label = "Installed successfully".to_string();
            }
            let _ = app.emit("downloads_changed", list.clone());
        }
    }

    let _ = app.emit("instances_changed", ());
    Ok(instance)
}

/// Downloads and installs a modpack from Modrinth or CurseForge directly
pub async fn install_modpack_from_url(
    app: &tauri::AppHandle,
    download_url: &str,
    custom_name: Option<String>,
    custom_icon: Option<String>,
) -> Result<Instance, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(download_url)
        .header("x-api-key", DEFAULT_CURSEFORGE_KEY)
        .send()
        .await
        .map_err(|e| format!("Failed to download modpack archive: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with status: {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read archive bytes: {}", e))?;

    install_modpack_bytes(app, &bytes, custom_name, custom_icon).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sample_mrpack_structure() {
        let json_index = r#"{
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": "1.0.0",
            "name": "Test Fabric Modpack",
            "summary": "A clean fabric pack",
            "files": [
                {
                    "path": "mods/sodium.jar",
                    "hashes": { "sha1": "abcdef123456" },
                    "downloads": [ "https://example.com/sodium.jar" ],
                    "fileSize": 1024
                }
            ],
            "dependencies": {
                "minecraft": "1.20.4",
                "fabric-loader": "0.15.7"
            }
        }"#;

        let parsed: MrpackIndex = serde_json::from_str(json_index).unwrap();
        assert_eq!(parsed.name, "Test Fabric Modpack");
        assert_eq!(parsed.dependencies.get("minecraft").unwrap(), "1.20.4");
        assert_eq!(parsed.dependencies.get("fabric-loader").unwrap(), "0.15.7");
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.files[0].path, "mods/sodium.jar");
    }

    #[test]
    fn parses_sample_curseforge_structure() {
        let manifest_json = r#"{
            "minecraft": {
                "version": "1.20.1",
                "modLoaders": [
                    { "id": "forge-47.2.0", "primary": true }
                ]
            },
            "manifestType": "minecraftModpack",
            "manifestVersion": 1,
            "name": "Test Forge Pack",
            "version": "1.0.0",
            "author": "Tester",
            "files": [
                { "projectID": 238086, "fileID": 451000, "required": true }
            ],
            "overrides": "overrides"
        }"#;

        let parsed: CurseForgeManifest = serde_json::from_str(manifest_json).unwrap();
        assert_eq!(parsed.name, "Test Forge Pack");
        assert_eq!(parsed.minecraft.version, "1.20.1");
        assert_eq!(parsed.minecraft.mod_loaders[0].id, "forge-47.2.0");
        assert_eq!(parsed.files.len(), 1);
        assert_eq!(parsed.overrides, "overrides");
    }

    #[test]
    fn parses_sample_prism_structure() {
        let mmc_pack_json = r#"{
            "components": [
                { "cachedVersion": "26.2", "important": true, "uid": "net.minecraft", "version": "26.2" },
                { "cachedVersion": "0.19.5", "uid": "net.fabricmc.fabric-loader", "version": "0.19.5" }
            ],
            "formatVersion": 1
        }"#;

        let parsed: MmcPackJson = serde_json::from_str(mmc_pack_json).unwrap();
        let mc = parsed.components.iter().find(|c| c.uid == "net.minecraft").unwrap();
        let loader = parsed.components.iter().find(|c| c.uid == "net.fabricmc.fabric-loader").unwrap();
        assert_eq!(mc.version.as_deref().unwrap(), "26.2");
        assert_eq!(loader.version.as_deref().unwrap(), "0.19.5");
    }
}
