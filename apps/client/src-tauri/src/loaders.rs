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

#[derive(Deserialize)]
struct PrismIndex {
    versions: Vec<PrismIndexVersion>,
}

#[derive(Deserialize)]
struct PrismIndexVersion {
    version: String,
    #[serde(default)]
    recommended: bool,
    #[serde(default)]
    requires: Vec<PrismRequirement>,
    #[serde(rename = "type")]
    version_type: Option<String>,
}

#[derive(Deserialize)]
struct PrismRequirement {
    uid: String,
    equals: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoaderProfilePackage {
    #[serde(default)]
    pub id: String,
    pub inherits_from: Option<String>,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(default)]
    pub libraries: Vec<LoaderLibraryEntry>,
    #[serde(default, rename = "mavenFiles")]
    pub maven_files: Option<Vec<LoaderLibraryEntry>>,
    #[serde(default, rename = "+tweakers")]
    pub tweakers: Option<Vec<String>>,
    #[serde(default, rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoaderLibraryEntry {
    pub name: String,
    pub url: Option<String>,
    pub downloads: Option<LoaderLibraryDownloads>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoaderLibraryDownloads {
    pub artifact: Option<LoaderArtifact>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoaderArtifact {
    pub url: Option<String>,
    pub path: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

/// Converts a maven coordinate like "net.fabricmc:sponge-mixin:0.15.4+mixin.0.8.7"
/// into relative path "net/fabricmc/sponge-mixin/0.15.4+mixin.0.8.7/sponge-mixin-0.15.4+mixin.0.8.7.jar"
pub fn maven_to_relative_path(name: &str) -> String {
    let parts: Vec<&str> = name.split(":").collect();
    if parts.len() >= 3 {
        let group = parts[0].replace(".", "/");
        let artifact = parts[1];
        let ver = parts[2];
        let classifier = if parts.len() >= 4 {
            format!("-{}", parts[3])
        } else {
            "".to_string()
        };
        format!(
            "{}/{}/{}/{}-{}{}.jar",
            group, artifact, ver, artifact, ver, classifier
        )
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
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    match loader.to_lowercase().as_str() {
        "fabric" => {
            // First attempt official Fabric meta
            let url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}",
                mc_version
            );
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
            let legacy_url = format!(
                "https://meta.legacyfabric.net/v2/versions/loader/{}",
                mc_version
            );
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
            let url = "https://meta.prismlauncher.org/v1/net.neoforged/index.json";
            if let Ok(res) = client.get(url).send().await {
                if let Ok(index) = res.json::<PrismIndex>().await {
                    let versions: Vec<LoaderVersionInfo> = index
                        .versions
                        .into_iter()
                        .filter(|v| {
                            v.requires.iter().any(|r| {
                                r.uid == "net.minecraft" && r.equals.as_deref() == Some(mc_version)
                            })
                        })
                        .map(|v| LoaderVersionInfo {
                            version: v.version,
                            stable: v.recommended || v.version_type.as_deref() == Some("release"),
                        })
                        .collect();
                    if !versions.is_empty() {
                        return Ok(versions);
                    }
                }
            }

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
            let url = "https://meta.prismlauncher.org/v1/net.minecraftforge/index.json";
            if let Ok(res) = client.get(url).send().await {
                if let Ok(index) = res.json::<PrismIndex>().await {
                    let versions: Vec<LoaderVersionInfo> = index
                        .versions
                        .into_iter()
                        .filter(|v| {
                            v.requires.iter().any(|r| {
                                r.uid == "net.minecraft" && r.equals.as_deref() == Some(mc_version)
                            })
                        })
                        .map(|v| LoaderVersionInfo {
                            version: v.version,
                            stable: v.recommended,
                        })
                        .collect();
                    if !versions.is_empty() {
                        return Ok(versions);
                    }
                }
            }

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
) -> Result<crate::instances::Instance, String> {
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
    crate::downloads::update_download_progress(
        app,
        crate::downloads::DownloadItem {
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
        },
    );

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    let versions_dir = mc_dir.join("versions");
    let _ = std::fs::create_dir_all(&versions_dir);
    let libs_dir = crate::paths::libraries_dir(app)?;
    let _ = std::fs::create_dir_all(&libs_dir);

    // 2. Fetch profile json for Fabric / Quilt / Forge / NeoForge
    let mut profile_json_bytes: Option<Vec<u8>> = None;
    let mut resolved_loader_version = loader_version.to_string();
    let mut profile_id = format!(
        "{}-loader-{}-{}",
        loader.to_lowercase(),
        loader_version,
        instance.mc_version
    );

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
    } else if loader.eq_ignore_ascii_case("forge") || loader.eq_ignore_ascii_case("neoforge") {
        let uid = if loader.eq_ignore_ascii_case("forge") {
            "net.minecraftforge"
        } else {
            "net.neoforged"
        };

        // Resolve "recommended" or "latest" to a concrete version string via Prism meta index
        let is_keyword = loader_version.eq_ignore_ascii_case("recommended")
            || loader_version.eq_ignore_ascii_case("latest")
            || loader_version.contains("recommended")
            || loader_version.contains("latest");

        if is_keyword {
            let index_url = format!("https://meta.prismlauncher.org/v1/{}/index.json", uid);
            if let Ok(res) = client.get(&index_url).send().await {
                if let Ok(index) = res.json::<PrismIndex>().await {
                    let matching: Vec<PrismIndexVersion> = index
                        .versions
                        .into_iter()
                        .filter(|v| {
                            v.requires.iter().any(|r| {
                                r.uid == "net.minecraft"
                                    && r.equals.as_deref() == Some(&instance.mc_version)
                            })
                        })
                        .collect();

                    if loader_version.contains("recommended") {
                        if let Some(rec) = matching.iter().find(|v| v.recommended) {
                            resolved_loader_version = rec.version.clone();
                        } else if let Some(first) = matching.first() {
                            resolved_loader_version = first.version.clone();
                        }
                    } else if let Some(first) = matching.first() {
                        resolved_loader_version = first.version.clone();
                    }
                }
            }
        }

        let component_url = format!(
            "https://meta.prismlauncher.org/v1/{}/{}.json",
            uid, resolved_loader_version
        );
        if let Ok(res) = client.get(&component_url).send().await {
            if res.status().is_success() {
                if let Ok(bytes) = res.bytes().await {
                    profile_json_bytes = Some(bytes.to_vec());
                }
            }
        }
    }

    if let Some(bytes) = profile_json_bytes {
        if let Ok(parsed) = serde_json::from_slice::<LoaderProfilePackage>(&bytes) {
            if !parsed.id.is_empty() {
                profile_id = parsed.id.clone();
            }

            // Collect all libraries including modern Forge mavenFiles
            let mut all_libs = parsed.libraries.clone();
            if let Some(extra_maven) = &parsed.maven_files {
                for m in extra_maven {
                    all_libs.push(m.clone());
                }
            }
            let total_libs = all_libs.len();

            let loader_dl_start = std::time::Instant::now();
            let mut total_downloaded_bytes: u64 = 0;

            // Download every library in the loader profile
            for (idx, lib) in all_libs.iter().enumerate() {
                let rel_path = lib
                    .downloads
                    .as_ref()
                    .and_then(|d| d.artifact.as_ref())
                    .and_then(|a| a.path.as_ref())
                    .cloned()
                    .unwrap_or_else(|| maven_to_relative_path(&lib.name));
                let dest_file = libs_dir.join(&rel_path);

                let elapsed_secs = loader_dl_start.elapsed().as_secs_f64();
                let current_speed = if elapsed_secs > 0.05 && total_downloaded_bytes > 0 {
                    (total_downloaded_bytes as f64 / elapsed_secs) as u64
                } else {
                    0
                };

                let progress = 10.0 + ((idx as f64 / total_libs.max(1) as f64) * 80.0);
                crate::downloads::update_download_progress(
                    app,
                    crate::downloads::DownloadItem {
                        id: task_id.clone(),
                        title: instance.name.clone(),
                        phase: "libraries".to_string(),
                        phase_label: format!(
                            "Downloading {} ({}/{})",
                            lib.name.split(':').nth(1).unwrap_or(&lib.name),
                            idx + 1,
                            total_libs
                        ),
                        downloaded_bytes: (idx + 1) as u64,
                        total_bytes: Some(total_libs as u64),
                        speed_bytes_per_sec: current_speed,
                        progress,
                        status: "downloading".to_string(),
                        error: None,
                        order: 0,
                        instance_name: Some(instance.name.clone()),
                        instance_icon: instance.icon.clone(),
                    },
                );

                if !dest_file.exists() {
                    if let Some(parent) = dest_file.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }

                    // Assemble download URL candidates across known Maven repositories
                    let mut candidate_urls = Vec::new();
                    if let Some(artifact_url) = lib
                        .downloads
                        .as_ref()
                        .and_then(|d| d.artifact.as_ref())
                        .and_then(|a| a.url.as_ref())
                    {
                        candidate_urls.push(artifact_url.clone());
                    }

                    if let Some(base_url) = &lib.url {
                        if base_url.ends_with('/') {
                            candidate_urls.push(format!("{}{}", base_url, rel_path));
                        } else {
                            candidate_urls.push(format!("{}/{}", base_url, rel_path));
                        }
                    }

                    // Repository fallback cascade for standard and legacy libraries
                    candidate_urls.push(format!("https://libraries.minecraft.net/{}", rel_path));
                    candidate_urls.push(format!("https://repo1.maven.org/maven2/{}", rel_path));
                    candidate_urls.push(format!("https://maven.minecraftforge.net/{}", rel_path));
                    candidate_urls.push(format!("https://maven.fabricmc.net/{}", rel_path));

                    for dl_url in candidate_urls {
                        if let Ok(resp) = client.get(&dl_url).send().await {
                            if resp.status().is_success() {
                                if let Ok(lib_bytes) = resp.bytes().await {
                                    total_downloaded_bytes += lib_bytes.len() as u64;
                                    let _ = std::fs::write(&dest_file, &lib_bytes);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // Save profile JSON under primary ID and convenience aliases so launcher lookups find it
            let target_version_dir = versions_dir.join(&profile_id);
            let _ = std::fs::create_dir_all(&target_version_dir);
            let _ = std::fs::write(
                target_version_dir.join(format!("{}.json", profile_id)),
                &bytes,
            );

            let alias_profile_name = format!(
                "{}-loader-{}-{}",
                loader.to_lowercase(),
                loader_version,
                instance.mc_version
            );
            if alias_profile_name != profile_id {
                let alias_dir = versions_dir.join(&alias_profile_name);
                let _ = std::fs::create_dir_all(&alias_dir);
                let _ = std::fs::write(
                    alias_dir.join(format!("{}.json", alias_profile_name)),
                    &bytes,
                );
            }

            let resolved_alias = format!(
                "{}-loader-{}-{}",
                loader.to_lowercase(),
                resolved_loader_version,
                instance.mc_version
            );
            if resolved_alias != profile_id && resolved_alias != alias_profile_name {
                let res_dir = versions_dir.join(&resolved_alias);
                let _ = std::fs::create_dir_all(&res_dir);
                let _ = std::fs::write(res_dir.join(format!("{}.json", resolved_alias)), &bytes);
            }
        }
    }

    crate::downloads::update_download_progress(
        app,
        crate::downloads::DownloadItem {
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
        },
    );

    // 3. Ensure mods folder exists inside the instance minecraft directory
    let mc_mods = mc_dir.join("mods");
    let _ = std::fs::create_dir_all(&mc_mods);

    // Remove legacy root mods symlink if present
    let root_mods = inst_dir.join("mods");
    if root_mods.is_symlink() {
        let _ = std::fs::remove_file(&root_mods);
    }

    // 4. Update instance.json with loader and rename default Vanilla instances
    instance.loader = Some(loader.to_string());
    instance.loader_version = Some(resolved_loader_version);

    let mut final_file = inst_file;

    // Rename instance identifier (directory on disk) to reflect the loader if it was a default vanilla identifier,
    // leaving instance.name intact as requested.
    let old_default_id = format!(
        "vanilla-{}",
        crate::instances::slugify(&instance.mc_version)
    );
    if instance.id == old_default_id || instance.id.starts_with("vanilla-") {
        let desired_id = format!(
            "{}-{}",
            crate::instances::slugify(loader),
            crate::instances::slugify(&instance.mc_version)
        );
        let base = crate::paths::instances_dir(app)?;
        let mut new_id = desired_id.clone();
        let mut counter = 1;
        while base.join(&new_id).exists() && base.join(&new_id) != inst_dir {
            new_id = format!("{}-{}", desired_id, counter);
            counter += 1;
        }

        if new_id != instance.id {
            let new_dir = base.join(&new_id);
            if std::fs::rename(&inst_dir, &new_dir).is_ok() {
                instance.id = new_id;
                final_file = new_dir.join("instance.json");
            }
        }
    }

    let updated_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance: {}", e))?;
    std::fs::write(&final_file, updated_json)
        .map_err(|e| format!("Failed to write instance.json: {}", e))?;

    // 5. Complete download item
    crate::downloads::update_download_progress(
        app,
        crate::downloads::DownloadItem {
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
        },
    );

    crate::downloads::finish_download(app, &task_id);

    let _ = app.emit("instances_changed", ());
    Ok(instance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_forge_1_8_9_profile_with_tweakers() {
        let sample = r#"{
            "formatVersion": 1,
            "name": "Forge",
            "uid": "net.minecraftforge",
            "version": "11.15.1.2318",
            "mainClass": "net.minecraft.launchwrapper.Launch",
            "+tweakers": [
                "net.minecraftforge.fml.common.launcher.FMLTweaker"
            ],
            "libraries": [
                {
                    "name": "net.minecraftforge:forge:1.8.9-11.15.1.2318-1.8.9:universal",
                    "url": "https://maven.minecraftforge.net/"
                },
                {
                    "name": "net.minecraft:launchwrapper:1.12"
                }
            ]
        }"#;

        let pkg: LoaderProfilePackage = serde_json::from_str(sample).unwrap();
        assert_eq!(pkg.main_class, "net.minecraft.launchwrapper.Launch");
        assert_eq!(
            pkg.tweakers.as_deref(),
            Some(&["net.minecraftforge.fml.common.launcher.FMLTweaker".to_string()][..])
        );
        assert_eq!(pkg.libraries.len(), 2);
    }

    #[test]
    fn fetches_forge_versions_for_1_8_9() {
        tauri::async_runtime::block_on(async {
            let res = fetch_loader_versions("1.8.9", "forge").await;
            assert!(res.is_ok());
            let list = res.unwrap();
            assert!(!list.is_empty());
            assert!(list.iter().any(|v| v.version == "11.15.1.2318" && v.stable));
        });
    }
}
