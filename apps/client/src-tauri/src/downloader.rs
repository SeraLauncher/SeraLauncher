use std::fs::File;
use std::path::{Path, PathBuf};

use crate::java::{inspect_java_binary, JavaRuntime};
use crate::paths::runtimes_dir;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

fn adoptium_os() -> &'static str {
    if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

fn adoptium_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    }
}

/// Recursively search a directory for the `java` (or `java.exe`) executable.
pub fn find_java_binary(root: &Path) -> Option<PathBuf> {
    if !root.is_dir() {
        return None;
    }

    let binary_name = if cfg!(windows) { "java.exe" } else { "java" };

    // Common standard paths inside Adoptium tarball / zip
    let direct_bin = root.join("bin").join(binary_name);
    if direct_bin.is_file() {
        return Some(direct_bin);
    }

    // macOS structure: root/Contents/Home/bin/java
    let mac_bin = root.join("Contents").join("Home").join("bin").join(binary_name);
    if mac_bin.is_file() {
        return Some(mac_bin);
    }

    // Check one level down in case of top-level folder (e.g. jdk8u402-b06/)
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let sub_bin = path.join("bin").join(binary_name);
                if sub_bin.is_file() {
                    return Some(sub_bin);
                }
                let sub_mac = path.join("Contents").join("Home").join("bin").join(binary_name);
                if sub_mac.is_file() {
                    return Some(sub_mac);
                }
            }
        }
    }

    None
}

/// Unpack a .tar.gz archive into `target_dir`.
fn unpack_tar_gz(archive_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let gz = flate2::read::GzDecoder::new(archive_bytes);
    let mut archive = tar::Archive::new(gz);
    archive
        .unpack(target_dir)
        .map_err(|err| format!("Failed to unpack tar.gz archive: {}", err))?;
    Ok(())
}

/// Unpack a .zip archive into `target_dir`.
fn unpack_zip(archive_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(archive_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|err| format!("Failed to open zip archive: {}", err))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|err| format!("Corrupt zip entry: {}", err))?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            let _ = std::fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    let _ = std::fs::create_dir_all(p);
                }
            }
            let mut outfile = File::create(&outpath)
                .map_err(|err| format!("Failed to create extracted file {}: {}", outpath.display(), err))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|err| format!("Failed to extract file {}: {}", outpath.display(), err))?;
        }
    }

    Ok(())
}

/// Ensure executable permissions on Unix systems for everything in bin/
#[cfg(unix)]
fn set_executable_permissions(binary: &Path) {
    if let Some(parent) = binary.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Ok(metadata) = p.metadata() {
                        let mut perms = metadata.permissions();
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&p, perms);
                    }
                }
            }
        }
    }
}

#[cfg(not(unix))]
fn set_executable_permissions(_binary: &Path) {}

/// Downloads and installs a specific Java major version from Adoptium Eclipse Temurin.
pub async fn install_adoptium_runtime(
    app: &tauri::AppHandle,
    major_version: u32,
) -> Result<JavaRuntime, String> {
    let base_dir = runtimes_dir(app)?;
    let target_dir = base_dir.join(format!("java-{}", major_version));

    // If already downloaded and valid, return it immediately
    if target_dir.is_dir() {
        if let Some(bin) = find_java_binary(&target_dir) {
            if let Some(runtime) = inspect_java_binary(&bin) {
                return Ok(runtime);
            }
        }
        // If directory exists but binary is corrupt, clean it up
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    let os = adoptium_os();
    let arch = adoptium_arch();
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse",
        major_version, os, arch
    );

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .map_err(|err| format!("Failed to create HTTP client: {}", err))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| format!("Failed to request Java {} runtime from Adoptium: {}", major_version, err))?;

    if !response.status().is_success() {
        return Err(format!(
            "Adoptium returned HTTP {} for Java {} ({}/{})",
            response.status(),
            major_version,
            os,
            arch
        ));
    }

    let task_id = format!("java-{}", major_version);
    let total_size = response.content_length();

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Java {} Runtime", major_version),
        phase: "java".to_string(),
        phase_label: format!("Downloading Java {} Runtime", major_version),
        downloaded_bytes: 0,
        total_bytes: total_size,
        speed_bytes_per_sec: 0,
        progress: 0.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
    });

    let mut response = response;
    let mut downloaded: u64 = 0;
    let mut bytes = Vec::new();
    if let Some(len) = total_size {
        bytes.reserve(len as usize);
    }

    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let mut current_speed = 0u64;

    while let Some(chunk) = response.chunk().await.map_err(|err| {
        let msg = format!("Failed to download Java archive: {}", err);
        crate::downloads::fail_download(app, &task_id, &msg);
        msg
    })? {
        downloaded += chunk.len() as u64;
        bytes.extend_from_slice(&chunk);

        if last_emit.elapsed() >= std::time::Duration::from_millis(150) {
            let delta = last_emit.elapsed().as_secs_f64();
            if delta > 0.0 {
                current_speed = ((downloaded.saturating_sub(last_bytes)) as f64 / delta) as u64;
            }
            last_bytes = downloaded;
            last_emit = std::time::Instant::now();

            let progress = if let Some(tot) = total_size {
                if tot > 0 { ((downloaded as f64 / tot as f64) * 100.0).min(98.0) } else { 0.0 }
            } else {
                0.0
            };

            crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
                id: task_id.clone(),
                title: format!("Java {} Runtime", major_version),
                phase: "java".to_string(),
                phase_label: format!("Downloading Java {} Runtime", major_version),
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                speed_bytes_per_sec: current_speed,
                progress,
                status: "downloading".to_string(),
                error: None,
                order: 0,
            });
        }
    }

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: format!("Java {} Runtime", major_version),
        phase: "java".to_string(),
        phase_label: format!("Extracting Java {} Runtime", major_version),
        downloaded_bytes: downloaded,
        total_bytes: total_size,
        speed_bytes_per_sec: 0,
        progress: 99.0,
        status: "extracting".to_string(),
        error: None,
        order: 0,
    });

    let temp_extract_dir = base_dir.join(format!("java-{}-download-tmp", major_version));
    if temp_extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&temp_extract_dir);
    }
    std::fs::create_dir_all(&temp_extract_dir)
        .map_err(|err| format!("Failed to create temporary directory: {}", err))?;

    if cfg!(windows) {
        unpack_zip(&bytes, &temp_extract_dir)?;
    } else {
        unpack_tar_gz(&bytes, &temp_extract_dir)?;
    }

    // Move from temporary extract dir to target_dir
    let _ = std::fs::remove_dir_all(&target_dir);
    std::fs::rename(&temp_extract_dir, &target_dir).map_err(|err| {
        format!(
            "Failed to finalize Java runtime directory {}: {}",
            target_dir.display(),
            err
        )
    })?;

    let binary = find_java_binary(&target_dir)
        .ok_or_else(|| format!("Could not find java executable inside extracted runtime at {}", target_dir.display()))?;

    set_executable_permissions(&binary);

    let res = inspect_java_binary(&binary)
        .ok_or_else(|| format!("Extracted Java runtime at {} failed validation", binary.display()));

    match &res {
        Ok(_) => crate::downloads::finish_download(app, &task_id),
        Err(e) => crate::downloads::fail_download(app, &task_id, e),
    }

    res
}
