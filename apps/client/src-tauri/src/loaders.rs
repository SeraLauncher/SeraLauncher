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
