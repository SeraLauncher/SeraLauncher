use std::fs::File;
use std::io::Read;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::discovery::{strip_minecraft_formatting, write_addon_index};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestedItem {
    pub file_name: String,
    pub display_name: String,
    pub category: String, // "mods" | "resourcepack" | "shader" | "world"
    pub target_path: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Ingests arbitrary dropped files (from desktop/file-manager) into an instance directory,
/// automatically classifying them into mods, resourcepacks, shaderpacks, or world saves.
pub fn ingest_dropped_files(
    app: &tauri::AppHandle,
    instance_id: &str,
    file_paths: Vec<String>,
) -> Result<Vec<IngestedItem>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let mods_dir = mc_dir.join("mods");
    let rp_dir = mc_dir.join("resourcepacks");
    let sp_dir = mc_dir.join("shaderpacks");
    let saves_dir = mc_dir.join("saves");

    let _ = std::fs::create_dir_all(&mods_dir);
    let _ = std::fs::create_dir_all(&rp_dir);
    let _ = std::fs::create_dir_all(&sp_dir);
    let _ = std::fs::create_dir_all(&saves_dir);

    let mut results = Vec::new();

    for path_str in file_paths {
        let source_path = crate::modpack::resolve_archive_path(&path_str);
        if !source_path.is_file() {
            results.push(IngestedItem {
                file_name: path_str.clone(),
                display_name: path_str,
                category: "unknown".to_string(),
                target_path: String::new(),
                success: false,
                error: Some("File does not exist or is not a valid regular file".to_string()),
            });
            continue;
        }

        let file_name = source_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("unknown")
            .to_string();

        let ext = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext == "jar" {
            // Mod JAR file
            let dest = mods_dir.join(&file_name);
            match std::fs::copy(&source_path, &dest) {
                Ok(_) => {
                    let bytes = std::fs::read(&dest).unwrap_or_default();
                    let mut hasher = Sha1::new();
                    hasher.update(&bytes);
                    let hash: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();

                    let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name);
                    let mut display_name = stem.to_string();

                    if let Ok(f) = File::open(&dest) {
                        if let Ok(mut archive) = zip::ZipArchive::new(f) {
                            if let Ok(mut mod_json) = archive.by_name("fabric.mod.json") {
                                let mut buf = String::new();
                                if mod_json.read_to_string(&mut buf).is_ok() {
                                    #[derive(Deserialize)]
                                    struct ModMeta {
                                        name: Option<String>,
                                    }
                                    if let Ok(p) = serde_json::from_str::<ModMeta>(&buf) {
                                        if let Some(n) = p.name {
                                            if !n.trim().is_empty() {
                                                display_name = strip_minecraft_formatting(&n);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    write_addon_index(
                        &mods_dir,
                        &file_name,
                        "mod",
                        "",
                        Some("local"),
                        Some(stem),
                        None,
                        &hash,
                        bytes.len() as u64,
                        Some(&display_name),
                        None,
                    );

                    results.push(IngestedItem {
                        file_name: file_name.clone(),
                        display_name,
                        category: "mods".to_string(),
                        target_path: dest.to_string_lossy().to_string(),
                        success: true,
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(IngestedItem {
                        file_name,
                        display_name: path_str,
                        category: "mods".to_string(),
                        target_path: String::new(),
                        success: false,
                        error: Some(format!("Failed to copy jar: {}", e)),
                    });
                }
            }
        } else if ext == "zip" || ext == "mrpack" {
            // Inspect zip contents to classify
            let inspect_result = File::open(&source_path)
                .map_err(|e| e.to_string())
                .and_then(|f| zip::ZipArchive::new(f).map_err(|e| e.to_string()));
            match inspect_result {
                Ok(mut archive) => {
                    let has_shaders = archive.by_name("shaders/").is_ok()
                        || (0..archive.len()).any(|i| archive.by_index(i).map(|e| e.name().starts_with("shaders/")).unwrap_or(false));
                    let has_mcmeta = archive.by_name("pack.mcmeta").is_ok();
                    let has_level_dat = archive.by_name("level.dat").is_ok()
                        || (0..archive.len()).any(|i| archive.by_index(i).map(|e| e.name().ends_with("level.dat")).unwrap_or(false));

                    if has_level_dat {
                        // World save zip
                        match crate::worlds::import_world_zip(app, instance_id, &source_path.to_string_lossy()) {
                            Ok(w) => {
                                results.push(IngestedItem {
                                    file_name: file_name.clone(),
                                    display_name: w.name,
                                    category: "world".to_string(),
                                    target_path: saves_dir.join(&w.folder_name).to_string_lossy().to_string(),
                                    success: true,
                                    error: None,
                                });
                            }
                            Err(e) => {
                                results.push(IngestedItem {
                                    file_name,
                                    display_name: path_str,
                                    category: "world".to_string(),
                                    target_path: String::new(),
                                    success: false,
                                    error: Some(e),
                                });
                            }
                        }
                    } else if has_shaders {
                        // Shaderpack zip
                        let dest = sp_dir.join(&file_name);
                        match std::fs::copy(&source_path, &dest) {
                            Ok(_) => {
                                let bytes = std::fs::read(&dest).unwrap_or_default();
                                let mut hasher = Sha1::new();
                                hasher.update(&bytes);
                                let hash: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
                                let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name);
                                let display_name = strip_minecraft_formatting(stem);

                                write_addon_index(
                                    &sp_dir,
                                    &file_name,
                                    "shader",
                                    "",
                                    Some("local"),
                                    Some(stem),
                                    None,
                                    &hash,
                                    bytes.len() as u64,
                                    Some(&display_name),
                                    None,
                                );

                                results.push(IngestedItem {
                                    file_name,
                                    display_name,
                                    category: "shader".to_string(),
                                    target_path: dest.to_string_lossy().to_string(),
                                    success: true,
                                    error: None,
                                });
                            }
                            Err(e) => {
                                results.push(IngestedItem {
                                    file_name,
                                    display_name: path_str,
                                    category: "shader".to_string(),
                                    target_path: String::new(),
                                    success: false,
                                    error: Some(e.to_string()),
                                });
                            }
                        }
                    } else if has_mcmeta {
                        // Resourcepack zip
                        let dest = rp_dir.join(&file_name);
                        match std::fs::copy(&source_path, &dest) {
                            Ok(_) => {
                                let bytes = std::fs::read(&dest).unwrap_or_default();
                                let mut hasher = Sha1::new();
                                hasher.update(&bytes);
                                let hash: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
                                let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or(&file_name);
                                let display_name = strip_minecraft_formatting(stem);

                                write_addon_index(
                                    &rp_dir,
                                    &file_name,
                                    "resourcepack",
                                    "",
                                    Some("local"),
                                    Some(stem),
                                    None,
                                    &hash,
                                    bytes.len() as u64,
                                    Some(&display_name),
                                    None,
                                );

                                results.push(IngestedItem {
                                    file_name,
                                    display_name,
                                    category: "resourcepack".to_string(),
                                    target_path: dest.to_string_lossy().to_string(),
                                    success: true,
                                    error: None,
                                });
                            }
                            Err(e) => {
                                results.push(IngestedItem {
                                    file_name,
                                    display_name: path_str,
                                    category: "resourcepack".to_string(),
                                    target_path: String::new(),
                                    success: false,
                                    error: Some(e.to_string()),
                                });
                            }
                        }
                    } else {
                        // Default zip: if dropped, copy as resourcepack
                        let dest = rp_dir.join(&file_name);
                        let _ = std::fs::copy(&source_path, &dest);
                        results.push(IngestedItem {
                            file_name: file_name.clone(),
                            display_name: file_name,
                            category: "resourcepack".to_string(),
                            target_path: dest.to_string_lossy().to_string(),
                            success: true,
                            error: None,
                        });
                    }
                }
                Err(e) => {
                    results.push(IngestedItem {
                        file_name,
                        display_name: path_str,
                        category: "archive".to_string(),
                        target_path: String::new(),
                        success: false,
                        error: Some(format!("Failed to open archive: {}", e)),
                    });
                }
            }
        } else {
            results.push(IngestedItem {
                file_name: file_name.clone(),
                display_name: file_name,
                category: "unsupported".to_string(),
                target_path: String::new(),
                success: false,
                error: Some(format!("Unsupported file extension .{}", ext)),
            });
        }
    }

    Ok(results)
}
