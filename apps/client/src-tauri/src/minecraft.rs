use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::java::required_java_version;
use crate::paths::{assets_dir, libraries_dir, versions_dir};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningInstanceInfo {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub started_at: u64,
}

struct ActiveInstance {
    pub info: RunningInstanceInfo,
    pub child: Arc<Mutex<Option<std::process::Child>>>,
}

static RUNNING_INSTANCES: Mutex<Option<HashMap<String, ActiveInstance>>> = Mutex::new(None);

pub fn list_running_instances() -> Vec<RunningInstanceInfo> {
    if let Ok(guard) = RUNNING_INSTANCES.lock() {
        if let Some(map) = guard.as_ref() {
            let mut list: Vec<RunningInstanceInfo> = map.values().map(|a| a.info.clone()).collect();
            list.sort_by(|a, b| b.started_at.cmp(&a.started_at));
            return list;
        }
    }
    Vec::new()
}

pub fn terminate_running_instance(id: &str) -> Result<(), String> {
    if let Ok(mut guard) = RUNNING_INSTANCES.lock() {
        if let Some(map) = guard.as_mut() {
            if let Some(active) = map.remove(id) {
                if let Ok(mut child_lock) = active.child.lock() {
                    if let Some(mut child) = child_lock.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    pub release_time: String,
    pub required_java_version: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftVersionsResponse {
    pub latest: LatestVersions,
    pub versions: Vec<VersionManifestEntry>,
}

#[derive(Deserialize)]
struct RawManifest {
    latest: LatestVersions,
    versions: Vec<RawVersionEntry>,
}

#[derive(Deserialize)]
struct RawVersionEntry {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
    url: String,
    time: String,
    #[serde(rename = "releaseTime")]
    release_time: String,
}

static CACHED_MANIFEST: Mutex<Option<MinecraftVersionsResponse>> = Mutex::new(None);

pub async fn fetch_minecraft_versions() -> Result<MinecraftVersionsResponse, String> {
    if let Ok(guard) = CACHED_MANIFEST.lock() {
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
    }

    let url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .map_err(|err| format!("HTTP client error: {}", err))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| format!("Failed to fetch Minecraft version manifest: {}", err))?;

    if !response.status().is_success() {
        return Err(format!(
            "Mojang version manifest returned HTTP {}",
            response.status()
        ));
    }

    let raw: RawManifest = response
        .json()
        .await
        .map_err(|err| format!("Failed to parse version manifest: {}", err))?;

    let versions: Vec<VersionManifestEntry> = raw
        .versions
        .into_iter()
        .map(|v| {
            let req_java = required_java_version(&v.id);
            VersionManifestEntry {
                id: v.id,
                version_type: v.version_type,
                url: v.url,
                time: v.time,
                release_time: v.release_time,
                required_java_version: req_java,
            }
        })
        .collect();

    let result = MinecraftVersionsResponse {
        latest: raw.latest,
        versions,
    };

    if let Ok(mut guard) = CACHED_MANIFEST.lock() {
        *guard = Some(result.clone());
    }

    Ok(result)
}

// =========================================================================
// Version JSON & Assets Data Structures
// =========================================================================
#[allow(dead_code)]

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct VersionPackage {
    pub id: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<VersionArguments>,
    pub downloads: VersionDownloads,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndexRef,
    pub libraries: Vec<VersionLibrary>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct VersionArguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct VersionDownloads {
    pub client: DownloadArtifact,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct DownloadArtifact {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct VersionLibrary {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<LibraryRule>>,
    pub natives: Option<HashMap<String, String>>,
    pub extract: Option<LibraryExtract>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadArtifact>,
    pub classifiers: Option<HashMap<String, DownloadArtifact>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<RuleOs>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RuleOs {
    pub name: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LibraryExtract {
    pub exclude: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AssetIndexManifest {
    pub objects: HashMap<String, AssetObject>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn library_rules_allow(rules: &[LibraryRule]) -> bool {
    let mut allowed = false;
    let current_os = current_os_name();

    for rule in rules {
        let matches = match &rule.os {
            Some(rule_os) => match &rule_os.name {
                Some(name) => name == current_os,
                None => true,
            },
            None => true,
        };

        if matches {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

fn verify_file_sha1(path: &Path, expected_sha1: &str) -> bool {
    if !path.exists() {
        return false;
    }
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return false,
    };
    let mut hasher = Sha1::new();
    hasher.update(&data);
    let hash: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
    hash.eq_ignore_ascii_case(expected_sha1)
}

async fn download_file_attempt(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    expected_sha1: Option<&str>,
) -> Result<(), String> {
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request error for {}: {}", url, e))?;

    if !res.status().is_success() {
        return Err(format!("Download failed HTTP {} for {}", res.status(), url));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response bytes from {}: {}", url, e))?;

    if let Some(sha1) = expected_sha1 {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let actual_hash: String = hasher.finalize().into_iter().map(|b| format!("{:02x}", b)).collect();
        if !actual_hash.eq_ignore_ascii_case(sha1) {
            return Err(format!(
                "Checksum mismatch for {}. Expected {}, got {}",
                url, sha1, actual_hash
            ));
        }
    }

    std::fs::write(target, bytes)
        .map_err(|e| format!("Failed to write file {}: {}", target.display(), e))?;

    Ok(())
}

async fn download_file_with_verify(
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    expected_sha1: Option<&str>,
) -> Result<(), String> {
    if let Some(sha1) = expected_sha1 {
        if verify_file_sha1(target, sha1) {
            return Ok(());
        }
    } else if target.exists() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut last_err = String::new();
    for attempt in 0..3 {
        match download_file_attempt(client, url, target, expected_sha1).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e;
                std::thread::sleep(std::time::Duration::from_millis(150 * (attempt + 1)));
            }
        }
    }

    Err(last_err)
}

fn extract_native_jar(jar_path: &Path, natives_dir: &Path, excludes: Option<&[String]>) -> Result<(), String> {
    let file = std::fs::File::open(jar_path)
        .map_err(|e| format!("Failed to open jar {}: {}", jar_path.display(), e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to parse zip archive {}: {}", jar_path.display(), e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let name = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };

        let name_str = name.to_string_lossy();
        if let Some(ex) = excludes {
            if ex.iter().any(|pattern| name_str.starts_with(pattern)) {
                continue;
            }
        }

        let outpath = natives_dir.join(name);
        if file.name().ends_with('/') {
            let _ = std::fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create extracted file {}: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file {}: {}", outpath.display(), e))?;
        }
    }

    Ok(())
}

/// Downloads all assets, libraries, and client jar for a Minecraft version.
/// Extracts natives to `<instance_dir>/natives`.
/// Returns (main_class, classpath_jars, natives_dir, asset_index_id, minecraft_arguments, version_package).
pub async fn install_minecraft_version(
    app: &tauri::AppHandle,
    mc_version: &str,
    instance_dir: &Path,
) -> Result<VersionPackage, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .map_err(|err| format!("HTTP client error: {}", err))?;

    let task_id = format!("mc-{}", mc_version);

    // 0. Immediately signal download manager that Minecraft is installing!
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Minecraft {}", mc_version),
        phase: "client".to_string(),
        phase_label: format!("Preparing Minecraft {}", mc_version),
        downloaded_bytes: 0,
        total_bytes: None,
        speed_bytes_per_sec: 0,
        progress: 2.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
    });

    // 1. Fetch Version Manifest to find the version URL
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Minecraft {}", mc_version),
        phase: "client".to_string(),
        phase_label: "Resolving Version Manifest".to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
        speed_bytes_per_sec: 0,
        progress: 5.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
    });
    let manifest = fetch_minecraft_versions().await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Minecraft version '{}' not found in manifest", mc_version))?;

    let versions_base = versions_dir(app)?;
    let ver_folder = versions_base.join(mc_version);
    let _ = std::fs::create_dir_all(&ver_folder);
    let version_json_file = ver_folder.join(format!("{}.json", mc_version));

    // Download version package JSON if not present
    let pkg_json_str = if version_json_file.exists() {
        std::fs::read_to_string(&version_json_file)
            .map_err(|e| format!("Failed to read {}: {}", version_json_file.display(), e))?
    } else {
        let res = client
            .get(&entry.url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch version package JSON: {}", e))?;
        if !res.status().is_success() {
            return Err(format!("Version package request HTTP {}", res.status()));
        }
        let text = res
            .text()
            .await
            .map_err(|e| format!("Failed to read package text: {}", e))?;
        let _ = std::fs::write(&version_json_file, &text);
        text
    };

    let pkg: VersionPackage = serde_json::from_str(&pkg_json_str)
        .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

    // 2. Download client.jar
    let client_jar_file = ver_folder.join(format!("{}.jar", mc_version));
    let client_size = pkg.downloads.client.size;
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Minecraft {}", mc_version),
        phase: "client".to_string(),
        phase_label: format!("Downloading Minecraft {} Client", mc_version),
        downloaded_bytes: 0,
        total_bytes: Some(client_size),
        speed_bytes_per_sec: 0,
        progress: 8.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
    });

    download_file_with_verify(
        &client,
        &pkg.downloads.client.url,
        &client_jar_file,
        Some(&pkg.downloads.client.sha1),
    )
    .await
    .map_err(|e| {
        crate::downloads::fail_download(app, &task_id, &e);
        e
    })?;

    // 3. Download Libraries and Extract Natives
    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Minecraft {}", mc_version),
        phase: "libraries".to_string(),
        phase_label: "Downloading Libraries & Natives".to_string(),
        downloaded_bytes: client_size,
        total_bytes: None,
        speed_bytes_per_sec: 0,
        progress: 15.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
    });

    let libs_base = libraries_dir(app)?;
    let current_os = current_os_name();
    let natives_dir = instance_dir.join("natives");
    let _ = std::fs::create_dir_all(&natives_dir);

    for lib in &pkg.libraries {
        if let Some(rules) = &lib.rules {
            if !library_rules_allow(rules) {
                continue;
            }
        }

        if let Some(downloads) = &lib.downloads {
            // Artifact JAR
            if let Some(artifact) = &downloads.artifact {
                let rel_path = artifact.path.clone().unwrap_or_else(|| {
                    let parts: Vec<&str> = lib.name.split(':').collect();
                    if parts.len() >= 3 {
                        let group = parts[0].replace('.', "/");
                        let name = parts[1];
                        let ver = parts[2];
                        format!("{}/{}/{}/{}-{}.jar", group, name, ver, name, ver)
                    } else {
                        format!("{}.jar", lib.name)
                    }
                });
                let dest = libs_base.join(rel_path);
                download_file_with_verify(&client, &artifact.url, &dest, Some(&artifact.sha1)).await?;
            }

            // Classifier / Natives
            if let Some(natives_map) = &lib.natives {
                if let Some(classifier_key) = natives_map.get(current_os) {
                    let key = classifier_key.replace("${arch}", if cfg!(target_pointer_width = "64") { "64" } else { "32" });
                    if let Some(classifiers) = &downloads.classifiers {
                        if let Some(native_artifact) = classifiers.get(&key) {
                            let rel_path = native_artifact.path.clone().unwrap_or_else(|| {
                                format!("{}-{}.jar", lib.name, key)
                            });
                            let dest = libs_base.join(rel_path);
                            download_file_with_verify(&client, &native_artifact.url, &dest, Some(&native_artifact.sha1)).await?;
                            let excludes = lib.extract.as_ref().and_then(|e| e.exclude.as_deref());
                            let _ = extract_native_jar(&dest, &natives_dir, excludes);
                        }
                    }
                }
            }
        }
    }

    // 4. Download Asset Index & Asset Objects
    let assets_base = assets_dir(app)?;
    let indexes_dir = assets_base.join("indexes");
    let objects_dir = assets_base.join("objects");
    let _ = std::fs::create_dir_all(&indexes_dir);
    let _ = std::fs::create_dir_all(&objects_dir);

    let index_file = indexes_dir.join(format!("{}.json", pkg.asset_index.id));
    let index_json_str = if index_file.exists() && verify_file_sha1(&index_file, &pkg.asset_index.sha1) {
        std::fs::read_to_string(&index_file)
            .map_err(|e| format!("Failed to read asset index: {}", e))?
    } else {
        download_file_with_verify(&client, &pkg.asset_index.url, &index_file, Some(&pkg.asset_index.sha1)).await?;
        std::fs::read_to_string(&index_file)
            .map_err(|e| format!("Failed to read asset index: {}", e))?
    };

    let asset_manifest: AssetIndexManifest = serde_json::from_str(&index_json_str)
        .map_err(|e| format!("Failed to parse asset index JSON: {}", e))?;

    // Download asset objects concurrently in batches
    let mut missing_assets = Vec::new();
    let mut total_missing_size: u64 = 0;
    for (_path, obj) in &asset_manifest.objects {
        let prefix = &obj.hash[..2];
        let target_path = objects_dir.join(prefix).join(&obj.hash);
        if !target_path.exists() {
            let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, obj.hash);
            missing_assets.push((url, target_path, obj.hash.clone(), obj.size));
            total_missing_size += obj.size;
        }
    }

    if !missing_assets.is_empty() {
        crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
            id: task_id.clone(),
            title: format!("Minecraft {} Assets", mc_version),
            phase: "assets".to_string(),
            phase_label: format!("Downloading Minecraft {} Assets", mc_version),
            downloaded_bytes: 0,
            total_bytes: Some(total_missing_size),
            speed_bytes_per_sec: 0,
            progress: 0.0,
            status: "downloading".to_string(),
            error: None,
            order: 0,
        });

        const BATCH_SIZE: usize = 32;
        let mut downloaded_asset_size: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let mut last_bytes = 0u64;
        let mut current_speed = 0u64;

        for chunk in missing_assets.chunks(BATCH_SIZE) {
            let mut futures = Vec::new();
            let mut chunk_size: u64 = 0;
            for (url, target, hash, size) in chunk {
                chunk_size += *size;
                let client_ref = client.clone();
                let url_c = url.clone();
                let target_c = target.clone();
                let hash_c = hash.clone();
                futures.push(async move {
                    download_file_with_verify(&client_ref, &url_c, &target_c, Some(&hash_c)).await
                });
            }
            let results = futures::future::join_all(futures).await;
            for r in results {
                if let Err(e) = r {
                    crate::downloads::fail_download(app, &task_id, &e);
                    return Err(e);
                }
            }

            downloaded_asset_size += chunk_size;

            if last_emit.elapsed() >= std::time::Duration::from_millis(150) {
                let delta = last_emit.elapsed().as_secs_f64();
                if delta > 0.0 {
                    current_speed = ((downloaded_asset_size.saturating_sub(last_bytes)) as f64 / delta) as u64;
                }
                last_bytes = downloaded_asset_size;
                last_emit = std::time::Instant::now();

                let progress = if total_missing_size > 0 {
                    ((downloaded_asset_size as f64 / total_missing_size as f64) * 100.0).min(99.0)
                } else {
                    100.0
                };

                crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
                    id: task_id.clone(),
                    title: format!("Minecraft {} Assets", mc_version),
                    phase: "assets".to_string(),
                    phase_label: format!("Downloading Minecraft {} Assets", mc_version),
                    downloaded_bytes: downloaded_asset_size,
                    total_bytes: Some(total_missing_size),
                    speed_bytes_per_sec: current_speed,
                    progress,
                    status: "downloading".to_string(),
                    error: None,
                    order: 0,
                });
            }
        }

        crate::downloads::finish_download(app, &task_id);
    }

    Ok(pkg)
}

/// Builds classpath list for a version package and client jar
pub fn collect_classpath(
    app: &tauri::AppHandle,
    pkg: &VersionPackage,
    mc_version: &str,
) -> Result<Vec<PathBuf>, String> {
    let libs_base = libraries_dir(app)?;
    let mut classpath = Vec::new();

    for lib in &pkg.libraries {
        if let Some(rules) = &lib.rules {
            if !library_rules_allow(rules) {
                continue;
            }
        }

        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                let rel_path = artifact.path.clone().unwrap_or_else(|| {
                    let parts: Vec<&str> = lib.name.split(':').collect();
                    if parts.len() >= 3 {
                        let group = parts[0].replace('.', "/");
                        let name = parts[1];
                        let ver = parts[2];
                        format!("{}/{}/{}/{}-{}.jar", group, name, ver, name, ver)
                    } else {
                        format!("{}.jar", lib.name)
                    }
                });
                let jar_path = libs_base.join(rel_path);
                if jar_path.exists() {
                    classpath.push(jar_path);
                }
            }
        }
    }

    let ver_folder = versions_dir(app)?.join(mc_version);
    let client_jar = ver_folder.join(format!("{}.jar", mc_version));
    if client_jar.exists() {
        classpath.push(client_jar);
    }

    Ok(classpath)
}

/// Spawns the Minecraft process for an instance
pub async fn launch_minecraft_instance(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<(), String> {
    let account = crate::auth::get_valid_active_account(app).await?;
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    let inst_data = std::fs::read_to_string(&inst_file)
        .map_err(|e| format!("Failed to read instance.json: {}", e))?;
    let mut instance: crate::instances::Instance = serde_json::from_str(&inst_data)
        .map_err(|e| format!("Failed to parse instance.json: {}", e))?;

    // 1. Ensure required Java runtime exists
    let req_java = crate::java::required_java_version(&instance.mc_version);
    let java_exec = if let Some(custom) = &instance.custom_java_path {
        if Path::new(custom).exists() {
            custom.clone()
        } else {
            let installed = crate::downloader::install_adoptium_runtime(app, req_java).await?;
            installed.path
        }
    } else {
        let installed = crate::downloader::install_adoptium_runtime(app, req_java).await?;
        installed.path
    };

    // 2. Ensure Minecraft version, libraries, assets & natives are downloaded/extracted
    let pkg = install_minecraft_version(app, &instance.mc_version, &inst_dir).await?;

    // 3. Assemble Classpath
    let classpath_jars = collect_classpath(app, &pkg, &instance.mc_version)?;
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let classpath_str = classpath_jars
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(sep);

    // 4. Memory settings
    let min_mem = instance.min_memory.unwrap_or(1024);
    let max_mem = instance.max_memory.unwrap_or(2048);

    // 5. Build JVM arguments
    let mut cmd_args = Vec::new();
    cmd_args.push(format!("-Xms{}M", min_mem));
    cmd_args.push(format!("-Xmx{}M", max_mem));

    let natives_dir = inst_dir.join("natives");
    cmd_args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));

    if let Some(extra_jvm) = &instance.jvm_args {
        for part in extra_jvm.split_whitespace() {
            if !part.is_empty() {
                cmd_args.push(part.to_string());
            }
        }
    }

    cmd_args.push("-cp".to_string());
    cmd_args.push(classpath_str);
    cmd_args.push(pkg.main_class.clone());

    // 6. Build Game arguments
    let game_dir = inst_dir.join(".minecraft");
    let assets_root = assets_dir(app)?;

    let (access_token, user_type) = if account.account_type == "offline" {
        ("0".to_string(), "legacy".to_string())
    } else {
        (
            account.minecraft_access_token.clone().unwrap_or_else(|| "0".to_string()),
            "msa".to_string(),
        )
    };

    if let Some(mc_args) = &pkg.minecraft_arguments {
        for token in mc_args.split_whitespace() {
            let replaced = token
                .replace("${auth_player_name}", &account.username)
                .replace("${version_name}", &instance.mc_version)
                .replace("${game_directory}", &game_dir.to_string_lossy())
                .replace("${assets_root}", &assets_root.to_string_lossy())
                .replace("${assets_index_name}", &pkg.asset_index.id)
                .replace("${auth_uuid}", &account.uuid)
                .replace("${auth_access_token}", &access_token)
                .replace("${user_type}", &user_type)
                .replace("${version_type}", &instance.version_type)
                .replace("${user_properties}", "{}");
            cmd_args.push(replaced);
        }
    } else {
        // Modern Minecraft (1.13+) argument format fallback
        cmd_args.push("--username".to_string());
        cmd_args.push(account.username.clone());
        cmd_args.push("--version".to_string());
        cmd_args.push(instance.mc_version.clone());
        cmd_args.push("--gameDir".to_string());
        cmd_args.push(game_dir.to_string_lossy().to_string());
        cmd_args.push("--assetsDir".to_string());
        cmd_args.push(assets_root.to_string_lossy().to_string());
        cmd_args.push("--assetIndex".to_string());
        cmd_args.push(pkg.asset_index.id.clone());
        cmd_args.push("--uuid".to_string());
        cmd_args.push(account.uuid.clone());
        cmd_args.push("--accessToken".to_string());
        cmd_args.push(access_token);
        cmd_args.push("--userType".to_string());
        cmd_args.push(user_type);
        cmd_args.push("--versionType".to_string());
        cmd_args.push(instance.version_type.clone());
    }

    // 7. Spawn Process
    let mut command = std::process::Command::new(&java_exec);
    command.args(&cmd_args);
    command.current_dir(&game_dir);

    let child = command
        .spawn()
        .map_err(|e| format!("Failed to launch Minecraft ({}) with {}: {}", instance.name, java_exec, e))?;

    let child_arc = Arc::new(Mutex::new(Some(child)));
    let now_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let info = RunningInstanceInfo {
        id: instance.id.clone(),
        name: instance.name.clone(),
        mc_version: instance.mc_version.clone(),
        started_at: now_epoch,
    };

    {
        let mut guard = RUNNING_INSTANCES.lock().unwrap();
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(instance.id.clone(), ActiveInstance {
            info,
            child: child_arc.clone(),
        });
    }

    let _ = app.emit("running_instances_changed", list_running_instances());

    // Watch child process in background thread
    let app_clone = app.clone();
    let inst_id_clone = instance.id.clone();
    std::thread::spawn(move || {
        let child_opt = {
            if let Ok(mut lock) = child_arc.lock() {
                lock.take()
            } else {
                None
            }
        };
        if let Some(mut c) = child_opt {
            let _ = c.wait();
        }
        if let Ok(mut guard) = RUNNING_INSTANCES.lock() {
            if let Some(map) = guard.as_mut() {
                map.remove(&inst_id_clone);
            }
        }
        let _ = app_clone.emit("running_instances_changed", list_running_instances());
    });

    // Update last_played on instance
    instance.last_played = Some(now_epoch.to_string());
    let _ = crate::instances::update_instance(app, &instance);

    Ok(())
}
