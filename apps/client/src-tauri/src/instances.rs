use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::java::{discover_java_runtimes_with_extra, required_java_version};
use crate::paths::{instances_dir, runtimes_dir};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub version_type: String,
    pub java_version_required: u32,
    pub custom_java_path: Option<String>,
    pub min_memory: Option<u32>,
    pub max_memory: Option<u32>,
    pub jvm_args: Option<String>,
    pub icon: Option<String>,
    pub created_at: String,
    pub last_played: Option<String>,
    pub play_time_seconds: u64,
    #[serde(default)]
    pub loader: Option<String>,
    #[serde(default)]
    pub loader_version: Option<String>,
}

/// Returns the path to the internal Minecraft game directory for an instance ("minecraft").
pub fn get_instance_game_dir(instance_dir: &Path) -> PathBuf {
    let mc = instance_dir.join("minecraft");
    let _ = std::fs::create_dir_all(&mc);
    mc
}

fn instance_file(instance_dir: &Path) -> PathBuf {
    instance_dir.join("instance.json")
}

/// Lists all instances stored in `<app_data>/instance`.
pub fn list_instances(app: &tauri::AppHandle) -> Result<Vec<Instance>, String> {
    let base = instances_dir(app)?;
    let mut instances = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let file = instance_file(&path);
                if file.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&file) {
                        if let Ok(inst) = serde_json::from_str::<Instance>(&content) {
                            instances.push(inst);
                        }
                    }
                }
            }
        }
    }

    // Sort: most recently created or played first
    instances.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(instances)
}

/// Helper to sanitize name into a directory-safe identifier
pub fn slugify(name: &str) -> String {
    let slug: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let cleaned = slug.trim_matches('-').to_lowercase();
    if cleaned.is_empty() {
        format!("instance-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
    } else {
        cleaned
    }
}

/// Creates a new vanilla instance.
/// Automatically verifies and downloads the required Java runtime if missing from the system.
pub async fn create_instance(
    app: &tauri::AppHandle,
    name: String,
    mc_version: String,
    version_type: Option<String>,
    icon: Option<String>,
    loader: Option<String>,
    loader_version: Option<String>,
) -> Result<Instance, String> {
    use tauri::Emitter;
    let base = instances_dir(app)?;
    let req_java = required_java_version(&mc_version);

    // 1. Immediately reserve instance directory and write initial instance.json
    let mut id = slugify(&name);
    let mut candidate_dir = base.join(&id);
    let mut counter = 1;
    while candidate_dir.exists() {
        id = format!("{}-{}", slugify(&name), counter);
        candidate_dir = base.join(&id);
        counter += 1;
    }

    std::fs::create_dir_all(&candidate_dir)
        .map_err(|err| format!("Failed to create instance directory: {}", err))?;

    let game_dir = get_instance_game_dir(&candidate_dir);
    let _ = std::fs::create_dir_all(&game_dir);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let mut instance = Instance {
        id: id.clone(),
        name,
        mc_version: mc_version.clone(),
        version_type: version_type.unwrap_or_else(|| "release".to_string()),
        java_version_required: req_java,
        custom_java_path: None,
        min_memory: None,
        max_memory: None,
        jvm_args: None,
        icon,
        created_at: now,
        last_played: None,
        play_time_seconds: 0,
        loader: loader.clone(),
        loader_version: loader_version.clone(),
    };

    let json = serde_json::to_string_pretty(&instance)
        .map_err(|err| format!("Failed to serialize instance: {}", err))?;
    std::fs::write(instance_file(&candidate_dir), json)
        .map_err(|err| format!("Failed to write instance.json: {}", err))?;

    // Notify UI immediately so the instance appears in the list in ~2ms!
    let _ = app.emit("instances_changed", ());

    // 2. Check if an acceptable Java runtime is already installed on the system or in runtimes/
    let extra_dir = runtimes_dir(app).ok();
    let extras: Vec<PathBuf> = extra_dir.into_iter().collect();
    let runtimes = discover_java_runtimes_with_extra(&extras);

    let matching_runtime = runtimes.iter().find(|r| {
        if req_java == 8 {
            r.major_version == 8
        } else if req_java == 16 || req_java == 17 {
            r.major_version == 16 || r.major_version == 17
        } else {
            r.major_version >= 21
        }
    });

    let java_res: Result<String, String> = if let Some(found) = matching_runtime {
        Ok(found.path.clone())
    } else {
        match crate::downloader::install_adoptium_runtime_with_instance(
            app,
            req_java,
            Some(&instance.name),
            instance.icon.as_deref(),
        ).await {
            Ok(installed) => Ok(installed.path),
            Err(e) => {
                let _ = std::fs::remove_dir_all(&candidate_dir);
                let _ = app.emit("instances_changed", ());
                return Err(e);
            }
        }
    };
    let java_path = java_res?;

    instance.custom_java_path = Some(java_path);
    if let Ok(updated_json) = serde_json::to_string_pretty(&instance) {
        let _ = std::fs::write(instance_file(&candidate_dir), updated_json);
    }
    let _ = app.emit("instances_changed", ());

    // 3. Download Minecraft version, libraries, assets & natives for this instance
    if let Err(e) = crate::minecraft::install_minecraft_version_with_instance(
        app,
        &instance.mc_version,
        &candidate_dir,
        Some(&instance.name),
        instance.icon.as_deref(),
    ).await {
        let _ = std::fs::remove_dir_all(&candidate_dir);
        let _ = app.emit("instances_changed", ());
        return Err(e);
    }
    let _ = app.emit("instances_changed", ());

    // 4. If a mod loader is selected, install the loader profile and libraries
    if let Some(ldr) = instance.loader.clone() {
        if !ldr.is_empty() && ldr != "vanilla" {
            let ldr_ver = match instance.loader_version.clone() {
                Some(v) if !v.trim().is_empty() => v,
                _ => {
                    let available = crate::loaders::fetch_loader_versions(&instance.mc_version, &ldr)
                        .await
                        .unwrap_or_default();
                    available
                        .first()
                        .map(|v| v.version.clone())
                        .unwrap_or_else(|| "latest".to_string())
                }
            };
            if let Ok(updated_inst) = crate::loaders::install_mod_loader(app, &instance.id, &ldr, &ldr_ver).await {
                instance = updated_inst;
                let _ = app.emit("instances_changed", ());
            }
        }
    }

    Ok(instance)
}

/// Delete an instance directory
pub fn delete_instance(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    use tauri::Emitter;
    let base = instances_dir(app)?;
    let target = base.join(id);
    if target.exists() && target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|err| format!("Failed to delete instance folder: {}", err))?;
    }
    let _ = app.emit("instances_changed", ());
    Ok(())
}

/// Update instance metadata and automatically rename the folder on disk when the name changes
pub fn update_instance(app: &tauri::AppHandle, mut instance: Instance) -> Result<Instance, String> {
    use tauri::Emitter;
    let base = instances_dir(app)?;
    let old_id = instance.id.clone();
    let old_target = base.join(&old_id);
    if !old_target.exists() {
        return Err(format!("Instance {} not found", old_id));
    }

    // Rename directory on disk to match new instance name if slug changed
    let desired_id = slugify(&instance.name);
    let mut final_target = old_target.clone();

    if desired_id != old_id {
        let mut new_id = desired_id.clone();
        let mut counter = 1;
        while base.join(&new_id).exists() && base.join(&new_id) != old_target {
            new_id = format!("{}-{}", desired_id, counter);
            counter += 1;
        }

        if new_id != old_id {
            let new_target = base.join(&new_id);
            std::fs::rename(&old_target, &new_target)
                .map_err(|err| format!("Failed to rename instance directory from {} to {}: {}", old_id, new_id, err))?;
            instance.id = new_id;
            final_target = new_target;
        }
    }

    let json = serde_json::to_string_pretty(&instance)
        .map_err(|err| format!("Failed to serialize instance: {}", err))?;
    std::fs::write(instance_file(&final_target), json)
        .map_err(|err| format!("Failed to write instance.json: {}", err))?;

    // Automatically create mods directory when a mod loader is configured
    if let Some(loader) = &instance.loader {
        let l = loader.to_lowercase();
        if l != "vanilla" && l != "none" {
            let game_dir = get_instance_game_dir(&final_target);
            let mods_dir = game_dir.join("mods");
            if !mods_dir.exists() {
                let _ = std::fs::create_dir_all(&mods_dir);
            }
        }
    }

    let _ = app.emit("instances_changed", ());
    Ok(instance)
}

/// Returns the absolute path of an instance directory
pub fn get_instance_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let base = instances_dir(app)?;
    let target = base.join(id);
    if target.exists() {
        Ok(target)
    } else {
        Err(format!("Instance {} does not exist", id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_and_deserializes_instance() {
        let inst = Instance {
            id: "vanilla-1-8-9".to_string(),
            name: "Vanilla 1.8.9".to_string(),
            mc_version: "1.8.9".to_string(),
            version_type: "release".to_string(),
            java_version_required: 8,
            custom_java_path: Some("/usr/lib/jvm/java-8-openjdk/bin/java".to_string()),
            min_memory: Some(1024),
            max_memory: Some(4096),
            jvm_args: None,
            icon: Some("grass".to_string()),
            created_at: "1727850000".to_string(),
            last_played: None,
            play_time_seconds: 0,
            loader: None,
            loader_version: None,
        };

        let json = serde_json::to_string(&inst).unwrap();
        let parsed: Instance = serde_json::from_str(&json).unwrap();
        assert_eq!(inst, parsed);
        assert_eq!(parsed.java_version_required, 8);
    }

    #[test]
    fn slugify_produces_safe_directory_names() {
        assert_eq!(slugify("Vanilla 1.21.4!"), "vanilla-1-21-4");
        assert_eq!(slugify("My Cool Instance"), "my-cool-instance");
    }
}


pub fn get_instance_name(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let dir = get_instance_dir(app, id)?;
    let inst_data = std::fs::read_to_string(instance_file(&dir)).map_err(|e| e.to_string())?;
    let instance: Instance = serde_json::from_str(&inst_data).map_err(|e| e.to_string())?;
    Ok(instance.name)
}


fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        out.push(CHARS[(b0 >> 2) as usize] as char);
        out.push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARS[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARS[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    pub file_name: String,
    pub size_bytes: u64,
    pub created_at: u64,
    pub data_url: String,
}

/// Lists all screenshots in the instance's minecraft/screenshots folder.
pub fn get_instance_screenshots(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<Vec<ScreenshotItem>, String> {
    let inst_dir = get_instance_dir(app, id)?;
    let screenshots_dir = get_instance_game_dir(&inst_dir).join("screenshots");

    if !screenshots_dir.exists() {
        return Ok(Vec::new());
    }

    let mut list = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&screenshots_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if ext != "png" && ext != "jpg" && ext != "jpeg" && ext != "webp" {
                continue;
            }

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let size_bytes = meta.len();
            let created_at = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            // Read image bytes and encode as data URL
            if let Ok(bytes) = std::fs::read(&path) {
                let mime = if ext == "jpg" || ext == "jpeg" {
                    "image/jpeg"
                } else if ext == "webp" {
                    "image/webp"
                } else {
                    "image/png"
                };
                let data_url = format!("data:{};base64,{}", mime, base64_encode(&bytes));
                list.push(ScreenshotItem {
                    file_name: name,
                    size_bytes,
                    created_at,
                    data_url,
                });
            }
        }
    }

    // Sort descending by created_at (newest first)
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(list)
}

/// Deletes a specific screenshot file from an instance's screenshots directory.
pub fn delete_instance_screenshot(
    app: &tauri::AppHandle,
    id: &str,
    file_name: &str,
) -> Result<(), String> {
    let inst_dir = get_instance_dir(app, id)?;
    let screenshot_path = get_instance_game_dir(&inst_dir).join("screenshots").join(file_name);

    if screenshot_path.exists() {
        std::fs::remove_file(&screenshot_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
