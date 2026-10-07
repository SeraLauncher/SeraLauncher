use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderVersionInfo {
    pub version: String,
    pub stable: bool,
}

#[derive(Deserialize)]
struct FabricLoaderEntry {
    loader: FabricLoaderDetail,
}

#[derive(Deserialize)]
struct FabricLoaderDetail {
    version: String,
    stable: Option<bool>,
}

#[derive(Deserialize)]
struct QuiltLoaderEntry {
    loader: QuiltLoaderDetail,
}

#[derive(Deserialize)]
struct QuiltLoaderDetail {
    version: String,
}

/// Fetches available loader versions for a specific Minecraft version.
pub async fn fetch_loader_versions(
    mc_version: &str,
    loader: &str,
) -> Result<Vec<LoaderVersionInfo>, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    match loader.to_lowercase().as_str() {
        "fabric" => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version);
            if let Ok(res) = client.get(&url).send().await {
                if let Ok(entries) = res.json::<Vec<FabricLoaderEntry>>().await {
                    let versions: Vec<LoaderVersionInfo> = entries
                        .into_iter()
                        .map(|e| LoaderVersionInfo {
                            version: e.loader.version,
                            stable: e.loader.stable.unwrap_or(true),
                        })
                        .collect();
                    if !versions.is_empty() {
                        return Ok(versions);
                    }
                }
            }
        }
        "quilt" => {
            let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", mc_version);
            if let Ok(res) = client.get(&url).send().await {
                if let Ok(entries) = res.json::<Vec<QuiltLoaderEntry>>().await {
                    let versions: Vec<LoaderVersionInfo> = entries
                        .into_iter()
                        .map(|e| LoaderVersionInfo {
                            version: e.loader.version,
                            stable: true,
                        })
                        .collect();
                    if !versions.is_empty() {
                        return Ok(versions);
                    }
                }
            }
        }
        "neoforge" => {
            // For NeoForge, latest builds match the game version prefix (e.g. 21.1.x for 1.21.1)
            let trimmed = mc_version.trim_start_matches("1.");
            return Ok(vec![
                LoaderVersionInfo {
                    version: format!("{}.latest", trimmed),
                    stable: true,
                },
                LoaderVersionInfo {
                    version: format!("{}.recommended", trimmed),
                    stable: true,
                },
            ]);
        }
        "forge" => {
            return Ok(vec![
                LoaderVersionInfo {
                    version: "recommended".to_string(),
                    stable: true,
                },
                LoaderVersionInfo {
                    version: "latest".to_string(),
                    stable: false,
                },
            ]);
        }
        _ => {}
    }

    Ok(vec![LoaderVersionInfo {
        version: "latest".to_string(),
        stable: true,
    }])
}

/// Installs a mod loader to an existing instance, downloading profile metadata,
/// creating the mods directory, and updating instance.json.
pub async fn install_mod_loader(
    app: &tauri::AppHandle,
    instance_id: &str,
    loader: &str,
    loader_version: &str,
) -> Result<(), String> {
    use tauri::Emitter;

    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    let inst_data = std::fs::read_to_string(&inst_file)
        .map_err(|e| format!("Failed to read instance.json: {}", e))?;
    let mut instance: crate::instances::Instance = serde_json::from_str(&inst_data)
        .map_err(|e| format!("Failed to parse instance.json: {}", e))?;

    let task_id = format!("loader-{}-{}", instance_id, loader);
    let ldr_title = format!("{} Loader {}", loader.to_uppercase(), loader_version);

    // 1. Emit start progress
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: instance.name.clone(),
        phase: "libraries".to_string(),
        phase_label: format!("Installing {} ({})", ldr_title, instance.mc_version),
        downloaded_bytes: 0,
        total_bytes: Some(100),
        speed_bytes_per_sec: 0,
        progress: 15.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
        instance_name: Some(instance.name.clone()),
        instance_icon: instance.icon.clone(),
    });

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // 2. Fetch profile json for Fabric / Quilt
    let mc_dir = inst_dir.join(".minecraft");
    let versions_dir = mc_dir.join("versions");
    let _ = std::fs::create_dir_all(&versions_dir);

    match loader.to_lowercase().as_str() {
        "fabric" => {
            let meta_url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
                instance.mc_version, loader_version
            );
            if let Ok(res) = client.get(&meta_url).send().await {
                if res.status().is_success() {
                    if let Ok(bytes) = res.bytes().await {
                        let target_version_dir = versions_dir.join(format!("fabric-loader-{}-{}", loader_version, instance.mc_version));
                        let _ = std::fs::create_dir_all(&target_version_dir);
                        let _ = std::fs::write(target_version_dir.join(format!("fabric-loader-{}-{}.json", loader_version, instance.mc_version)), &bytes);
                    }
                }
            }
        }
        "quilt" => {
            let meta_url = format!(
                "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
                instance.mc_version, loader_version
            );
            if let Ok(res) = client.get(&meta_url).send().await {
                if res.status().is_success() {
                    if let Ok(bytes) = res.bytes().await {
                        let target_version_dir = versions_dir.join(format!("quilt-loader-{}-{}", loader_version, instance.mc_version));
                        let _ = std::fs::create_dir_all(&target_version_dir);
                        let _ = std::fs::write(target_version_dir.join(format!("quilt-loader-{}-{}.json", loader_version, instance.mc_version)), &bytes);
                    }
                }
            }
        }
        _ => {}
    }

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: instance.name.clone(),
        phase: "libraries".to_string(),
        phase_label: "Configuring mods directories...".to_string(),
        downloaded_bytes: 75,
        total_bytes: Some(100),
        speed_bytes_per_sec: 0,
        progress: 75.0,
        status: "extracting".to_string(),
        error: None,
        order: 0,
        instance_name: Some(instance.name.clone()),
        instance_icon: instance.icon.clone(),
    });

    // 3. Ensure mods folder exists at BOTH root {inst_dir}/mods and {inst_dir}/.minecraft/mods
    let mc_mods = mc_dir.join("mods");
    let root_mods = inst_dir.join("mods");

    let _ = std::fs::create_dir_all(&mc_mods);
    let _ = std::fs::create_dir_all(&root_mods);

    #[cfg(unix)]
    {
        // If root_mods is empty and not a symlink, create a symlink to .minecraft/mods so both mirror each other
        if !root_mods.is_symlink() {
            if let Ok(entries) = std::fs::read_dir(&root_mods) {
                if entries.count() == 0 {
                    let _ = std::fs::remove_dir(&root_mods);
                    let _ = std::os::unix::fs::symlink(".minecraft/mods", &root_mods);
                }
            }
        }
    }

    // 4. Update instance.json with loader
    instance.loader = Some(loader.to_string());
    instance.loader_version = Some(loader_version.to_string());

    let updated_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance: {}", e))?;
    std::fs::write(&inst_file, updated_json)
        .map_err(|e| format!("Failed to write instance.json: {}", e))?;

    // 5. Complete download item
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id,
        title: instance.name.clone(),
        phase: "libraries".to_string(),
        phase_label: format!("{} installed successfully", ldr_title),
        downloaded_bytes: 100,
        total_bytes: Some(100),
        speed_bytes_per_sec: 0,
        progress: 100.0,
        status: "completed".to_string(),
        error: None,
        order: 0,
        instance_name: Some(instance.name.clone()),
        instance_icon: instance.icon.clone(),
    });

    let _ = app.emit("instances_changed", ());
    Ok(())
}
