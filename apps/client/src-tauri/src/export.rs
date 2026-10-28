use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::instances::Instance;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub instance_id: String,
    pub name: String,
    pub format: String, // "sera_zip" | "mrpack"
    pub include_mods: bool,
    pub include_configs: bool,
    pub include_resourcepacks: bool,
    pub include_shaderpacks: bool,
    pub include_saves: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

/// Helper to sanitize name into a filesystem-safe identifier
fn sanitize_filename(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        "Minecraft-Instance".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Resolves user's Downloads directory, falling back to home dir or current working dir
fn resolve_downloads_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        let dl = PathBuf::from(&home).join("Downloads");
        if dl.is_dir() {
            return dl;
        }
        return PathBuf::from(home);
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn add_path_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    disk_path: &Path,
    archive_path: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    if disk_path.is_file() {
        zip.start_file(archive_path, options)
            .map_err(|e| format!("Failed to create zip entry {}: {}", archive_path, e))?;
        let mut f = File::open(disk_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
    } else if disk_path.is_dir() {
        let clean_prefix = archive_path.trim_end_matches('/');
        if let Ok(entries) = std::fs::read_dir(disk_path) {
            for entry in entries.flatten() {
                let p = entry.path();
                let fname = entry.file_name().to_string_lossy().to_string();
                let sub_archive_path = if clean_prefix.is_empty() {
                    fname
                } else {
                    format!("{}/{}", clean_prefix, fname)
                };
                add_path_to_zip(zip, &p, &sub_archive_path, options)?;
            }
        }
    }
    Ok(())
}

/// Constructs mmc-pack.json for Prism Launcher / MultiMC cross-compatibility
fn generate_mmc_pack_json(instance: &Instance) -> String {
    let mut components = Vec::new();

    // LWJGL
    components.push(serde_json::json!({
        "cachedName": "LWJGL 3",
        "cachedVersion": "3.4.1",
        "dependencyOnly": true,
        "uid": "org.lwjgl3",
        "version": "3.4.1"
    }));

    // Minecraft
    components.push(serde_json::json!({
        "cachedName": "Minecraft",
        "cachedVersion": instance.mc_version,
        "important": true,
        "uid": "net.minecraft",
        "version": instance.mc_version
    }));

    // Loader
    if let (Some(ref ldr), Some(ref ver)) = (&instance.loader, &instance.loader_version) {
        let l = ldr.to_lowercase();
        if l == "fabric" {
            components.push(serde_json::json!({
                "cachedName": "Fabric Loader",
                "cachedVersion": ver,
                "uid": "net.fabricmc.fabric-loader",
                "version": ver
            }));
        } else if l == "forge" {
            components.push(serde_json::json!({
                "cachedName": "Forge",
                "cachedVersion": ver,
                "uid": "net.minecraftforge",
                "version": ver
            }));
        } else if l == "neoforge" {
            components.push(serde_json::json!({
                "cachedName": "NeoForge",
                "cachedVersion": ver,
                "uid": "net.neoforged",
                "version": ver
            }));
        } else if l == "quilt" {
            components.push(serde_json::json!({
                "cachedName": "Quilt Loader",
                "cachedVersion": ver,
                "uid": "org.quiltmc.quilt-loader",
                "version": ver
            }));
        }
    }

    serde_json::to_string_pretty(&serde_json::json!({
        "formatVersion": 1,
        "components": components
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

/// Constructs instance.cfg for Prism Launcher / MultiMC cross-compatibility
fn generate_instance_cfg(instance: &Instance) -> String {
    format!(
        "[General]\nConfigVersion=1.3\nInstanceType=OneSix\nname={}\niconKey={}\nlastPlayed={}\n",
        instance.name,
        instance.icon.as_deref().unwrap_or("default"),
        instance.last_played.as_deref().unwrap_or("0")
    )
}

/// Exports an instance into an archive package (.zip or .mrpack)
pub fn export_instance(
    app: &tauri::AppHandle,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    let inst_dir = crate::instances::get_instance_dir(app, &options.instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    if !inst_file.is_file() {
        return Err(format!("Instance not found: {}", options.instance_id));
    }

    let inst_data = std::fs::read_to_string(&inst_file).map_err(|e| e.to_string())?;
    let instance: Instance = serde_json::from_str(&inst_data).map_err(|e| e.to_string())?;

    let is_mrpack = options.format.eq_ignore_ascii_case("mrpack");
    let ext = if is_mrpack { "mrpack" } else { "zip" };
    let sanitized_title = sanitize_filename(&options.name);
    let file_name = format!("{}.{}", sanitized_title, ext);

    let downloads_dir = resolve_downloads_dir();
    let output_path = downloads_dir.join(&file_name);

    let file = File::create(&output_path).map_err(|e| {
        format!(
            "Failed to create export file {}: {}",
            output_path.display(),
            e
        )
    })?;

    let mut zip = zip::ZipWriter::new(file);
    let zip_opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    if is_mrpack {
        // 1. Modrinth .mrpack format: generate modrinth.index.json
        let mut dependencies = std::collections::HashMap::new();
        dependencies.insert("minecraft".to_string(), instance.mc_version.clone());
        if let (Some(ref ldr), Some(ref ver)) = (&instance.loader, &instance.loader_version) {
            let ldr_key = match ldr.to_lowercase().as_str() {
                "fabric" => "fabric-loader",
                "quilt" => "quilt-loader",
                "forge" => "forge",
                "neoforge" => "neoforge",
                _ => "fabric-loader",
            };
            dependencies.insert(ldr_key.to_string(), ver.clone());
        }

        let mut mrpack_files = Vec::new();
        let index_dir = mc_dir.join("mods").join(".index");

        // Parse indexed mods to generate file download declarations
        if options.include_mods && index_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&index_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("conf") {
                        if let Ok(conf_str) = std::fs::read_to_string(&p) {
                            let mut fname = String::new();
                            let mut url = String::new();
                            let mut sha1_hash = String::new();
                            let mut size_b = 0u64;

                            for line in conf_str.lines() {
                                let trimmed = line.trim();
                                if trimmed.starts_with("filename =") {
                                    if let Some(val) = trimmed.split('=').nth(1) {
                                        fname = val
                                            .trim()
                                            .trim_matches(|c| c == '"' || c == '\'')
                                            .to_string();
                                    }
                                } else if trimmed.starts_with("url =") {
                                    if let Some(val) = trimmed.split('=').nth(1) {
                                        url = val
                                            .trim()
                                            .trim_matches(|c| c == '"' || c == '\'')
                                            .to_string();
                                    }
                                } else if trimmed.starts_with("hash =") {
                                    if let Some(val) = trimmed.split('=').nth(1) {
                                        sha1_hash = val
                                            .trim()
                                            .trim_matches(|c| c == '"' || c == '\'')
                                            .to_string();
                                    }
                                } else if trimmed.starts_with("size_bytes =") {
                                    if let Some(val) = trimmed.split('=').nth(1) {
                                        size_b = val.trim().parse().unwrap_or(0);
                                    }
                                }
                            }

                            if !fname.is_empty() && !url.is_empty() && !sha1_hash.is_empty() {
                                let mut hashes = std::collections::HashMap::new();
                                hashes.insert("sha1".to_string(), sha1_hash);
                                mrpack_files.push(serde_json::json!({
                                    "path": format!("mods/{}", fname),
                                    "hashes": hashes,
                                    "downloads": [url],
                                    "fileSize": size_b
                                }));
                            }
                        }
                    }
                }
            }
        }

        let index_json_str = serde_json::to_string_pretty(&serde_json::json!({
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": "1.0.0",
            "name": options.name,
            "summary": format!("Exported from SeraLauncher: {}", instance.name),
            "files": mrpack_files,
            "dependencies": dependencies
        }))
        .unwrap_or_else(|_| "{}".to_string());

        zip.start_file("modrinth.index.json", zip_opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(index_json_str.as_bytes())
            .map_err(|e| e.to_string())?;

        // Add overrides
        if options.include_configs {
            let config_dir = mc_dir.join("config");
            if config_dir.is_dir() {
                add_path_to_zip(&mut zip, &config_dir, "overrides/config", zip_opts)?;
            }
            let options_txt = mc_dir.join("options.txt");
            if options_txt.is_file() {
                add_path_to_zip(&mut zip, &options_txt, "overrides/options.txt", zip_opts)?;
            }
            let options_shaders = mc_dir.join("optionsshaders.txt");
            if options_shaders.is_file() {
                add_path_to_zip(
                    &mut zip,
                    &options_shaders,
                    "overrides/optionsshaders.txt",
                    zip_opts,
                )?;
            }
        }

        if options.include_resourcepacks {
            let rp_dir = mc_dir.join("resourcepacks");
            if rp_dir.is_dir() {
                add_path_to_zip(&mut zip, &rp_dir, "overrides/resourcepacks", zip_opts)?;
            }
        }

        if options.include_shaderpacks {
            let sp_dir = mc_dir.join("shaderpacks");
            if sp_dir.is_dir() {
                add_path_to_zip(&mut zip, &sp_dir, "overrides/shaderpacks", zip_opts)?;
            }
        }
    } else {
        // 2. Universal Sera / Prism Launcher / MultiMC package format
        // Root metadata
        zip.start_file("instance.json", zip_opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(inst_data.as_bytes())
            .map_err(|e| e.to_string())?;

        let mmc_pack = generate_mmc_pack_json(&instance);
        zip.start_file("mmc-pack.json", zip_opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(mmc_pack.as_bytes())
            .map_err(|e| e.to_string())?;

        let instance_cfg = generate_instance_cfg(&instance);
        zip.start_file("instance.cfg", zip_opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(instance_cfg.as_bytes())
            .map_err(|e| e.to_string())?;

        // Bundled minecraft/ directories
        if options.include_mods {
            let mods_dir = mc_dir.join("mods");
            if mods_dir.is_dir() {
                add_path_to_zip(&mut zip, &mods_dir, "minecraft/mods", zip_opts)?;
            }
        }

        if options.include_configs {
            let config_dir = mc_dir.join("config");
            if config_dir.is_dir() {
                add_path_to_zip(&mut zip, &config_dir, "minecraft/config", zip_opts)?;
            }
            let options_txt = mc_dir.join("options.txt");
            if options_txt.is_file() {
                add_path_to_zip(&mut zip, &options_txt, "minecraft/options.txt", zip_opts)?;
            }
            let options_shaders = mc_dir.join("optionsshaders.txt");
            if options_shaders.is_file() {
                add_path_to_zip(
                    &mut zip,
                    &options_shaders,
                    "minecraft/optionsshaders.txt",
                    zip_opts,
                )?;
            }
        }

        if options.include_resourcepacks {
            let rp_dir = mc_dir.join("resourcepacks");
            if rp_dir.is_dir() {
                add_path_to_zip(&mut zip, &rp_dir, "minecraft/resourcepacks", zip_opts)?;
            }
        }

        if options.include_shaderpacks {
            let sp_dir = mc_dir.join("shaderpacks");
            if sp_dir.is_dir() {
                add_path_to_zip(&mut zip, &sp_dir, "minecraft/shaderpacks", zip_opts)?;
            }
        }

        if options.include_saves {
            let saves_dir = mc_dir.join("saves");
            if saves_dir.is_dir() {
                add_path_to_zip(&mut zip, &saves_dir, "minecraft/saves", zip_opts)?;
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize export archive: {}", e))?;

    let size_bytes = std::fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(ExportResult {
        output_path: output_path.to_string_lossy().to_string(),
        file_name,
        size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_valid_mmc_components() {
        let instance = Instance {
            id: "test-instance".to_string(),
            name: "Test Instance".to_string(),
            mc_version: "26.2".to_string(),
            version_type: "release".to_string(),
            java_version_required: 25,
            custom_java_path: None,
            min_memory: None,
            max_memory: None,
            jvm_args: None,
            icon: None,
            created_at: "0".to_string(),
            last_played: None,
            play_time_seconds: 0,
            loader: Some("fabric".to_string()),
            loader_version: Some("0.19.5".to_string()),
        };

        let json = generate_mmc_pack_json(&instance);
        assert!(json.contains("net.minecraft"));
        assert!(json.contains("26.2"));
        assert!(json.contains("net.fabricmc.fabric-loader"));
        assert!(json.contains("0.19.5"));
    }
}
