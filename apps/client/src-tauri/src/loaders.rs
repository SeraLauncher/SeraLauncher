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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderProfilePackage {
    pub id: String,
    pub inherits_from: Option<String>,
    pub main_class: String,
    pub libraries: Vec<LoaderLibraryEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoaderLibraryEntry {
    pub name: String,
    pub url: Option<String>,
}

/// Converts a maven coordinate like "net.fabricmc:sponge-mixin:0.15.4+mixin.0.8.7"
/// into relative path "net/fabricmc/sponge-mixin/0.15.4+mixin.0.8.7/sponge-mixin-0.15.4+mixin.0.8.7.jar"
pub fn maven_to_relative_path(name: &str) -> String {
    let parts: Vec<&str> = name.split(":").collect();
    if parts.len() >= 3 {
        let group = parts[0].replace(".", "/");
        let artifact = parts[1];
        let ver = parts[2];
        let classifier = if parts.len() >= 4 { format!("-{}", parts[3]) } else { "".to_string() };
        format!("{}/{}/{}/{}-{}{}.jar", group, artifact, ver, artifact, ver, classifier)
    } else {
        format!("{}.jar", name)
    }
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
            // First attempt official Fabric meta
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

            // Fallback for older legacy versions (1.8.9, 1.12.2, etc.) using Legacy Fabric
            let legacy_url = format!("https://meta.legacyfabric.net/v2/versions/loader/{}", mc_version);
            if let Ok(res) = client.get(&legacy_url).send().await {
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
/// downloading all required loader library JARs, creating the mods directory,
/// and registering real progress in the header download manager.
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
    let ldr_name = match loader.to_lowercase().as_str() {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "neoforge" => "NeoForge",
        "forge" => "Forge",
        _ => loader,
    };
    let ldr_title = format!("{} Loader {}", ldr_name, loader_version);

    // 1. Signal download manager in header
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: instance.name.clone(),
        phase: "libraries".to_string(),
        phase_label: format!("Resolving {} Profile", ldr_title),
        downloaded_bytes: 0,
        total_bytes: None,
        speed_bytes_per_sec: 0,
        progress: 5.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
        instance_name: Some(instance.name.clone()),
        instance_icon: instance.icon.clone(),
    });

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mc_dir = inst_dir.join(".minecraft");
    let versions_dir = mc_dir.join("versions");
    let _ = std::fs::create_dir_all(&versions_dir);
    let libs_dir = crate::paths::libraries_dir(app)?;
    let _ = std::fs::create_dir_all(&libs_dir);

    // 2. Fetch profile json for Fabric / Quilt
    let mut profile_json_bytes: Option<Vec<u8>> = None;
    let mut profile_id = format!("{}-loader-{}-{}", loader.to_lowercase(), loader_version, instance.mc_version);

    if loader.eq_ignore_ascii_case("fabric") {
        let meta_url = format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
            instance.mc_version, loader_version
        );
        if let Ok(res) = client.get(&meta_url).send().await {
            if res.status().is_success() {
                if let Ok(bytes) = res.bytes().await {
                    profile_json_bytes = Some(bytes.to_vec());
                }
            }
        }

        // Try legacy fabric for 1.8.9 and older if standard fabric meta returned 404
        if profile_json_bytes.is_none() {
            let legacy_url = format!(
                "https://meta.legacyfabric.net/v2/versions/loader/{}/{}/profile/json",
                instance.mc_version, loader_version
            );
            if let Ok(res) = client.get(&legacy_url).send().await {
                if res.status().is_success() {
                    if let Ok(bytes) = res.bytes().await {
                        profile_json_bytes = Some(bytes.to_vec());
                    }
                }
            }
        }
    } else if loader.eq_ignore_ascii_case("quilt") {
        let meta_url = format!(
            "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
            instance.mc_version, loader_version
        );
        if let Ok(res) = client.get(&meta_url).send().await {
            if res.status().is_success() {
                if let Ok(bytes) = res.bytes().await {
                    profile_json_bytes = Some(bytes.to_vec());
                }
            }
        }
    }

    if let Some(bytes) = profile_json_bytes {
        if let Ok(parsed) = serde_json::from_slice::<LoaderProfilePackage>(&bytes) {
            profile_id = parsed.id.clone();
            let total_libs = parsed.libraries.len();

            // Download every library in the loader profile
            for (idx, lib) in parsed.libraries.iter().enumerate() {
                let rel_path = maven_to_relative_path(&lib.name);
                let dest_file = libs_dir.join(&rel_path);

                let progress = 10.0 + ((idx as f64 / total_libs.max(1) as f64) * 80.0);
                crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
                    id: task_id.clone(),
                    title: instance.name.clone(),
                    phase: "libraries".to_string(),
                    phase_label: format!("Downloading {} ({}/{})", lib.name.split(":").nth(1).unwrap_or(&lib.name), idx + 1, total_libs),
                    downloaded_bytes: (idx + 1) as u64,
                    total_bytes: Some(total_libs as u64),
                    speed_bytes_per_sec: 0,
                    progress,
                    status: "downloading".to_string(),
                    error: None,
                    order: 0,
                    instance_name: Some(instance.name.clone()),
                    instance_icon: instance.icon.clone(),
                });

                if !dest_file.exists() {
                    if let Some(parent) = dest_file.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }

                    // Build download URL from maven URL or fallback to maven.fabricmc.net / central
                    let base_url = lib.url.clone().unwrap_or_else(|| "https://maven.fabricmc.net/".to_string());
                    let full_url = if base_url.ends_with("/") {
                        format!("{}{}", base_url, rel_path)
                    } else {
                        format!("{}/{}", base_url, rel_path)
                    };

                    if let Ok(resp) = client.get(&full_url).send().await {
                        if resp.status().is_success() {
                            if let Ok(lib_bytes) = resp.bytes().await {
                                let _ = std::fs::write(&dest_file, &lib_bytes);
                            }
                        }
                    }
                }
            }

            // Save profile JSON
            let target_version_dir = versions_dir.join(&profile_id);
            let _ = std::fs::create_dir_all(&target_version_dir);
            let _ = std::fs::write(target_version_dir.join(format!("{}.json", profile_id)), &bytes);
        }
    }

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: instance.name.clone(),
        phase: "libraries".to_string(),
        phase_label: "Configuring mods directories...".to_string(),
        downloaded_bytes: 95,
        total_bytes: Some(100),
        speed_bytes_per_sec: 0,
        progress: 95.0,
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

    // 4. Update instance.json with loader and rename default Vanilla instances
    instance.loader = Some(loader.to_string());
    instance.loader_version = Some(loader_version.to_string());

    let old_default_name = format!("Vanilla {}", instance.mc_version);
    if instance.name.eq_ignore_ascii_case(&old_default_name) || instance.name.to_lowercase().starts_with("vanilla ") {
        instance.name = format!("{} {}", ldr_name, instance.mc_version);
    }

    let updated_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance: {}", e))?;
    std::fs::write(&inst_file, updated_json)
        .map_err(|e| format!("Failed to write instance.json: {}", e))?;

    // 5. Complete download item
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
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

    crate::downloads::finish_download(app, &task_id);

    let _ = app.emit("instances_changed", ());
    Ok(())
}
