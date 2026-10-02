use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

use crate::downloader::install_adoptium_runtime;
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
fn slugify(name: &str) -> String {
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

    let game_dir = candidate_dir.join(".minecraft");
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

    let java_path = if let Some(found) = matching_runtime {
        found.path.clone()
    } else {
        // Auto-install required Java via Adoptium
        let installed = install_adoptium_runtime(app, req_java).await?;
        installed.path
    };

    instance.custom_java_path = Some(java_path);
    if let Ok(updated_json) = serde_json::to_string_pretty(&instance) {
        let _ = std::fs::write(instance_file(&candidate_dir), updated_json);
    }
    let _ = app.emit("instances_changed", ());

    // 3. Download Minecraft version, libraries, assets & natives for this instance
    let _ = crate::minecraft::install_minecraft_version(app, &instance.mc_version, &candidate_dir).await?;
    let _ = app.emit("instances_changed", ());

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

/// Update instance metadata
pub fn update_instance(app: &tauri::AppHandle, instance: &Instance) -> Result<(), String> {
    use tauri::Emitter;
    let base = instances_dir(app)?;
    let target = base.join(&instance.id);
    if !target.exists() {
        return Err(format!("Instance {} not found", instance.id));
    }

    let json = serde_json::to_string_pretty(instance)
        .map_err(|err| format!("Failed to serialize instance: {}", err))?;
    std::fs::write(instance_file(&target), json)
        .map_err(|err| format!("Failed to write instance.json: {}", err))?;

    let _ = app.emit("instances_changed", ());
    Ok(())
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
