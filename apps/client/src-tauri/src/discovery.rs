mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut result = String::with_capacity(s.len() * 3);
        for b in s.bytes() {
            match b {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(b as char);
                }
                _ => {
                    result.push_str(&format!("%{:02X}", b));
                }
            }
        }
        result
    }
}

use serde::{Deserialize, Serialize};
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

use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::io::{Read, Seek};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryProject {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: Option<u64>,
    pub source: String,          // "modrinth" | "curseforge"
    pub project_type: String,    // "modpack" | "mod" | "resourcepack" | "shader"
    pub categories: Vec<String>,
    pub supported_loaders: Vec<String>,
    pub supported_versions: Vec<String>,
    pub date_modified: Option<String>,
    pub download_url: Option<String>,
    pub environment: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySearchResponse {
    pub source: String,
    pub projects: Vec<DiscoveryProject>,
    pub total_hits: u64,
    pub offset: u32,
    pub limit: u32,
}

// Modrinth search JSON structures
#[derive(Deserialize)]
struct ModrinthSearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    author: String,
    icon_url: Option<String>,
    downloads: u64,
    follows: Option<u64>,
    project_type: String,
    categories: Option<Vec<String>>,
    display_categories: Option<Vec<String>>,
    versions: Option<Vec<String>>,
    date_modified: Option<String>,
    client_side: Option<String>,
    server_side: Option<String>,
}

#[derive(Deserialize)]
struct ModrinthSearchOutput {
    hits: Vec<ModrinthSearchHit>,
    total_hits: u64,
    offset: u32,
    limit: u32,
}

// CurseForge search JSON structures
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeSearchOutput {
    data: Vec<CurseForgeMod>,
    pagination: Option<CurseForgePagination>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgePagination {
    total_count: Option<u64>,
    index: Option<u32>,
    page_size: Option<u32>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeMod {
    id: u64,
    slug: String,
    name: String,
    summary: String,
    authors: Option<Vec<CurseForgeAuthor>>,
    logo: Option<CurseForgeLogo>,
    download_count: Option<f64>,
    thumbs_up_count: Option<u64>,
    categories: Option<Vec<CurseForgeCategory>>,
    latest_files_indexes: Option<Vec<CurseForgeFileIndex>>,
    date_modified: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeAuthor {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeLogo {
    thumbnail_url: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeCategory {
    name: String,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFileIndex {
    game_version: Option<String>,
    mod_loader: Option<u32>,
}

static SEARCH_CACHE: Mutex<Option<HashMap<String, (Instant, DiscoverySearchResponse)>>> = Mutex::new(None);
const CACHE_TTL_SECS: u64 = 300; // 5 minutes cache

pub const DEFAULT_CURSEFORGE_KEY: &str = "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm";

pub async fn search_projects(
    provider: &str,
    project_type: &str,
    query: Option<&str>,
    mc_version: Option<&str>,
    loader: Option<&str>,
    environment: Option<&str>,
    sort: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<DiscoverySearchResponse, String> {
    let cache_key = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}",
        provider.to_lowercase(),
        project_type.to_lowercase(),
        query.unwrap_or("").trim().to_lowercase(),
        mc_version.unwrap_or(""),
        loader.unwrap_or(""),
        environment.unwrap_or(""),
        sort.unwrap_or(""),
        offset,
        limit
    );

    // Check in-memory cache first for instant response
    if let Ok(guard) = SEARCH_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if let Some((inserted_at, cached_res)) = cache.get(&cache_key) {
                if inserted_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS) {
                    return Ok(cached_res.clone());
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = if provider.eq_ignore_ascii_case("curseforge") {
        search_curseforge(&client, project_type, query, mc_version, loader, sort, offset, limit).await?
    } else {
        search_modrinth(&client, project_type, query, mc_version, loader, environment, sort, offset, limit).await?
    };

    // Store in cache
    if let Ok(mut guard) = SEARCH_CACHE.lock() {
        let cache = guard.get_or_insert_with(HashMap::new);
        // Prune expired entries if cache is growing
        if cache.len() > 120 {
            cache.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(CACHE_TTL_SECS));
        }
        cache.insert(cache_key, (Instant::now(), res.clone()));
    }

    Ok(res)
}

async fn search_modrinth(
    client: &reqwest::Client,
    project_type: &str,
    query: Option<&str>,
    mc_version: Option<&str>,
    loader: Option<&str>,
    environment: Option<&str>,
    sort: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<DiscoverySearchResponse, String> {
    // Map project type to Modrinth facet
    let type_facet = match project_type.to_lowercase().as_str() {
        "modpack" => "project_type:modpack",
        "mods" | "mod" => "project_type:mod",
        "resourcepack" | "resourcepacks" => "project_type:resourcepack",
        "shader" | "shaders" => "project_type:shader",
        _ => "project_type:mod",
    };

    let mut facets = vec![vec![type_facet.to_string()]];

    if let Some(v) = mc_version {
        if !v.is_empty() && v != "all" {
            facets.push(vec![format!("versions:{}", v)]);
        }
    }

    if let Some(l) = loader {
        if !l.is_empty() && l != "all" && l != "vanilla" {
            facets.push(vec![format!("categories:{}", l.to_lowercase())]);
        }
    }

    if let Some(env) = environment {
        match env.to_lowercase().as_str() {
            "client" => facets.push(vec!["client_side:required".to_string()]),
            "server" => facets.push(vec!["server_side:required".to_string()]),
            _ => {}
        }
    }

    let facets_json = serde_json::to_string(&facets).unwrap_or_else(|_| "[]".to_string());

    let index_sort = match sort.unwrap_or("downloads") {
        "newest" => "newest",
        "updated" => "updated",
        "relevance" => "relevance",
        _ => "downloads",
    };

    let mut url = format!(
        "https://api.modrinth.com/v2/search?facets={}&index={}&offset={}&limit={}",
        urlencoding::encode(&facets_json),
        index_sort,
        offset,
        limit.min(50)
    );

    if let Some(q) = query {
        if !q.trim().is_empty() {
            url.push_str(&format!("&query={}", urlencoding::encode(q.trim())));
        }
    }

    let req = client.get(&url);

    let res = req.send().await.map_err(|e| format!("Modrinth search failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Modrinth error: HTTP {}", res.status()));
    }

    let data: ModrinthSearchOutput = res.json().await.map_err(|e| e.to_string())?;

    let projects = data.hits.into_iter().map(|h| {
        let loaders = h.display_categories.or(h.categories).unwrap_or_default();
        DiscoveryProject {
            id: h.project_id,
            slug: h.slug,
            title: h.title,
            description: h.description,
            author: h.author,
            icon_url: h.icon_url,
            downloads: h.downloads,
            follows: h.follows,
            source: "modrinth".to_string(),
            project_type: h.project_type,
            categories: loaders.clone(),
            supported_loaders: loaders,
            supported_versions: h.versions.unwrap_or_default(),
            date_modified: h.date_modified,
            download_url: None,
            environment: {
                let client = h.client_side.as_deref().unwrap_or("optional");
                let server = h.server_side.as_deref().unwrap_or("optional");
                if client != "unsupported" && server != "unsupported" {
                    Some("both".to_string())
                } else if client != "unsupported" {
                    Some("client".to_string())
                } else if server != "unsupported" {
                    Some("server".to_string())
                } else {
                    None
                }
            },
        }
    }).collect();

    Ok(DiscoverySearchResponse {
        source: "modrinth".to_string(),
        projects,
        total_hits: data.total_hits,
        offset: data.offset,
        limit: data.limit,
    })
}

async fn search_curseforge(
    client: &reqwest::Client,
    project_type: &str,
    query: Option<&str>,
    mc_version: Option<&str>,
    loader: Option<&str>,
    sort: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<DiscoverySearchResponse, String> {
    // Class IDs for Minecraft (gameId = 432)
    let class_id = match project_type.to_lowercase().as_str() {
        "modpack" => 4471,
        "mods" | "mod" => 6,
        "resourcepack" | "resourcepacks" => 12,
        "shader" | "shaders" => 6552,
        _ => 6,
    };

    let sort_field = match sort.unwrap_or("downloads") {
        "newest" => "3",
        "updated" => "2",
        "relevance" => "1",
        _ => "6", // Total Downloads
    };

    let mut url = format!(
        "https://api.curseforge.com/v1/mods/search?gameId=432&classId={}&sortField={}&sortOrder=desc&index={}&pageSize={}",
        class_id,
        sort_field,
        offset,
        limit.min(50)
    );

    if let Some(q) = query {
        if !q.trim().is_empty() {
            url.push_str(&format!("&searchFilter={}", urlencoding::encode(q.trim())));
        }
    }

    if let Some(v) = mc_version {
        if !v.is_empty() && v != "all" {
            url.push_str(&format!("&gameVersion={}", urlencoding::encode(v)));
        }
    }

    if let Some(l) = loader {
        let loader_type = match l.to_lowercase().as_str() {
            "forge" => Some("1"),
            "fabric" => Some("4"),
            "quilt" => Some("5"),
            "neoforge" => Some("6"),
            _ => None,
        };
        if let Some(lt) = loader_type {
            url.push_str(&format!("&modLoaderType={}", lt));
        }
    }

    let req = client.get(&url).header("x-api-key", DEFAULT_CURSEFORGE_KEY);

    let res = req.send().await.map_err(|e| format!("CurseForge search failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("CurseForge error: HTTP {}", res.status()));
    }

    let data: CurseForgeSearchOutput = res.json().await.map_err(|e| e.to_string())?;

    let total = data.pagination.as_ref().and_then(|p| p.total_count).unwrap_or(data.data.len() as u64);
    let projects = data.data.into_iter().map(|m| {
        let author = m.authors.and_then(|a| a.first().map(|auth| auth.name.clone())).unwrap_or_else(|| "Unknown".to_string());
        let icon_url = m.logo.and_then(|l| l.thumbnail_url.or(l.url));
        let cats = m.categories.unwrap_or_default().into_iter().map(|c| c.name).collect();

        DiscoveryProject {
            id: m.id.to_string(),
            slug: m.slug,
            title: m.name,
            description: m.summary,
            author,
            icon_url,
            downloads: m.download_count.unwrap_or(0.0) as u64,
            follows: m.thumbs_up_count,
            source: "curseforge".to_string(),
            project_type: project_type.to_string(),
            categories: cats,
            supported_loaders: Vec::new(),
            supported_versions: Vec::new(),
            date_modified: m.date_modified,
            download_url: None,
            environment: None,
        }
    }).collect();

    Ok(DiscoverySearchResponse {
        source: "curseforge".to_string(),
        projects,
        total_hits: total,
        offset,
        limit,
    })
}

/// Installs a downloaded mod, resourcepack, or shader directly into an instance folder.
pub fn write_addon_index(
    sub_dir: &Path,
    file_name: &str,
    project_type: &str,
    download_url: &str,
    provider: Option<&str>,
    project_id: Option<&str>,
    version_id: Option<&str>,
    sha1_hash: &str,
    size_bytes: u64,
) {
    let index_dir = sub_dir.join(".index");
    if let Err(_) = std::fs::create_dir_all(&index_dir) {
        return;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);

    let conf_path = index_dir.join(format!("{}.conf", stem));

    let now = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_secs(),
        Err(_) => 0,
    };

    // Infer version_id from Modrinth URL if not explicitly supplied
    let resolved_version_id = version_id.map(|s| s.to_string()).unwrap_or_else(|| {
        if download_url.contains("/versions/") {
            download_url.split("/versions/").nth(1)
                .and_then(|rest| rest.split('/').next())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        }
    });

    let conf_content = format!(
        "# SeraLauncher Addon Index\n[addon]\nname = \"{stem}\"\nfilename = \"{file_name}\"\ntype = \"{project_type}\"\n\n[source]\nprovider = \"{prov}\"\nproject_id = \"{proj_id}\"\nversion_id = \"{ver_id}\"\nurl = \"{download_url}\"\n\n[integrity]\nalgorithm = \"sha1\"\nhash = \"{sha1_hash}\"\nsize_bytes = {size_bytes}\n\n[meta]\ninstalled_at_unix = {now}\nmanaged_by = \"sera\"\n",
        stem = stem,
        file_name = file_name,
        project_type = project_type,
        prov = provider.unwrap_or("unknown"),
        proj_id = project_id.unwrap_or(""),
        ver_id = resolved_version_id,
        download_url = download_url,
        sha1_hash = sha1_hash,
        size_bytes = size_bytes,
        now = now
    );

    let _ = std::fs::write(conf_path, conf_content);
}

pub async fn install_file_to_instance(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
    download_url: &str,
    file_name: &str,
    provider: Option<&str>,
    project_id: Option<&str>,
    version_id: Option<&str>,
) -> Result<PathBuf, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    if !sub_dir.exists() {
        let _ = std::fs::create_dir_all(&sub_dir);
    }

    let target_file = sub_dir.join(file_name);

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let inst_name = crate::instances::get_instance_name(app, instance_id).unwrap_or_else(|_| "Instance".to_string());
    let task_id = format!("addon-{}-{}", instance_id, file_name);
    let total_expected = None;

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: inst_name.clone(),
        phase: "libraries".to_string(),
        phase_label: format!("Downloading {}", file_name),
        downloaded_bytes: 0,
        total_bytes: total_expected,
        speed_bytes_per_sec: 0,
        progress: 10.0,
        status: "downloading".to_string(),
        error: None,
        order: 0,
        instance_name: Some(inst_name.clone()),
        instance_icon: None,
    });

    // Guard: Prevent downloading API metadata endpoints as jar/zip files
    let url_trimmed = download_url.trim_end_matches("/");
    if url_trimmed.ends_with("/version") || url_trimmed.ends_with("/versions") {
        let err_msg = "Cannot install: API metadata endpoint provided instead of a binary JAR/ZIP archive.".to_string();
        crate::downloads::fail_download(app, &task_id, &err_msg);
        return Err(err_msg);
    }

    let mut res = client.get(download_url).send().await.map_err(|e| {
        crate::downloads::fail_download(app, &task_id, &e.to_string());
        format!("Download failed: {}", e)
    })?;

    if !res.status().is_success() {
        let err_msg = format!("Download returned status {}", res.status());
        crate::downloads::fail_download(app, &task_id, &err_msg);
        return Err(err_msg);
    }

    let content_len = res.content_length();
    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::File::create(&target_file).await.map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut is_first_chunk = true;
    let mut hasher = Sha1::new();

    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes: u64 = 0;
    let mut current_speed: u64 = 0;

    while let Some(chunk) = res.chunk().await.map_err(|e| {
        let _ = std::fs::remove_file(&target_file);
        e.to_string()
    })? {
        if is_first_chunk {
            is_first_chunk = false;
            // Verify that mods/archives are not raw JSON text
            if chunk.starts_with(b"[") || chunk.starts_with(b"{") {
                let _ = std::fs::remove_file(&target_file);
                let err_msg = "Download aborted: received JSON API response instead of a JAR/ZIP archive".to_string();
                crate::downloads::fail_download(app, &task_id, &err_msg);
                return Err(err_msg);
            }
        }

        file.write_all(&chunk).await.map_err(|e| {
            let _ = std::fs::remove_file(&target_file);
            e.to_string()
        })?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;

        // Calculate download speed and emit progress periodically or on the first non-empty chunk
        let elapsed_emit = last_emit.elapsed();
        if elapsed_emit >= std::time::Duration::from_millis(120) || current_speed == 0 {
            let delta = elapsed_emit.as_secs_f64();
            if delta > 0.05 {
                current_speed = ((downloaded.saturating_sub(last_bytes)) as f64 / delta) as u64;
                last_bytes = downloaded;
                last_emit = std::time::Instant::now();
            } else {
                let total_elapsed = start_time.elapsed().as_secs_f64();
                if total_elapsed > 0.05 {
                    current_speed = (downloaded as f64 / total_elapsed) as u64;
                }
            }

            let pct = if let Some(tot) = content_len {
                if tot > 0 { ((downloaded as f64 / tot as f64) * 100.0).min(99.0) } else { 50.0 }
            } else {
                50.0
            };

            crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
                id: task_id.clone(),
                title: inst_name.clone(),
                phase: "libraries".to_string(),
                phase_label: format!("Downloading {}", file_name),
                downloaded_bytes: downloaded,
                total_bytes: content_len,
                speed_bytes_per_sec: current_speed,
                progress: pct,
                status: "downloading".to_string(),
                error: None,
                order: 0,
                instance_name: Some(inst_name.clone()),
                instance_icon: None,
            });
        }
    }

    crate::downloads::update_download_progress(app, crate::downloads::DownloadItem {
        id: task_id.clone(),
        title: inst_name.clone(),
        phase: "libraries".to_string(),
        phase_label: format!("Installed {}", file_name),
        downloaded_bytes: downloaded,
        total_bytes: Some(downloaded),
        speed_bytes_per_sec: 0,
        progress: 100.0,
        status: "completed".to_string(),
        error: None,
        order: 0,
        instance_name: Some(inst_name),
        instance_icon: None,
    });

    crate::downloads::finish_download(app, &task_id);

    let hash_bytes = hasher.finalize();
    let mut digest = String::with_capacity(40);
    for b in hash_bytes {
        use std::fmt::Write;
        let _ = write!(digest, "{:02x}", b);
    }
    write_addon_index(
        &sub_dir,
        file_name,
        project_type,
        download_url,
        provider,
        project_id,
        version_id,
        &digest,
        downloaded,
    );

    Ok(target_file)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryLicense {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryLinks {
    pub website: Option<String>,
    pub source: Option<String>,
    pub issues: Option<String>,
    pub wiki: Option<String>,
    pub discord: Option<String>,
    pub donate: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryAuthor {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub role: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryGalleryItem {
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub featured: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryProjectDetails {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub description: String,
    pub description_type: String, // "markdown" | "html"
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: Option<u64>,
    pub source: String,
    pub project_type: String,
    pub categories: Vec<String>,
    pub supported_loaders: Vec<String>,
    pub supported_versions: Vec<String>,
    pub environment: Option<String>,
    pub links: DiscoveryLinks,
    pub creators: Vec<DiscoveryAuthor>,
    pub license: Option<DiscoveryLicense>,
    pub published_date: Option<String>,
    pub updated_date: Option<String>,
    pub gallery: Vec<DiscoveryGalleryItem>,
    pub web_url: String,
    pub report_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryVersion {
    pub id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub date_published: String,
    pub file_size: u64,
    pub download_url: String,
    pub file_name: String,
    pub version_type: String,
    pub downloads: Option<u64>,
}

// Modrinth Project details JSON
#[derive(Deserialize)]
struct ModrinthProjectData {
    id: String,
    slug: String,
    project_type: String,
    title: String,
    description: String,
    body: Option<String>,
    icon_url: Option<String>,
    downloads: u64,
    followers: Option<u64>,
    categories: Option<Vec<String>>,
    additional_categories: Option<Vec<String>>,
    game_versions: Option<Vec<String>>,
    loaders: Option<Vec<String>>,
    client_side: Option<String>,
    server_side: Option<String>,
    issues_url: Option<String>,
    source_url: Option<String>,
    wiki_url: Option<String>,
    discord_url: Option<String>,
    donation_urls: Option<Vec<ModrinthDonationUrl>>,
    gallery: Option<Vec<ModrinthGalleryItem>>,
    license: Option<ModrinthLicense>,
    published: Option<String>,
    updated: Option<String>,
}

#[derive(Deserialize)]
struct ModrinthDonationUrl {
    url: String,
}

#[derive(Deserialize)]
struct ModrinthGalleryItem {
    title: Option<String>,
    description: Option<String>,
    url: String,
    raw_url: Option<String>,
    featured: Option<bool>,
}

#[derive(Deserialize)]
struct ModrinthLicense {
    name: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize)]
struct ModrinthMemberItem {
    role: Option<String>,
    user: ModrinthUser,
}

#[derive(Deserialize)]
struct ModrinthUser {
    id: String,
    username: String,
    avatar_url: Option<String>,
}


#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct ModrinthDependencyItem {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub file_name: Option<String>,
    pub dependency_type: String, // "required", "optional", "incompatible", "embedded"
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurseForgeFileDependency {
    pub mod_id: u64,
    pub relation_type: u32, // 3 = RequiredDependency
}

#[derive(Deserialize)]
struct ModrinthVersionItem {
    id: String,
    name: String,
    version_number: String,
    game_versions: Option<Vec<String>>,
    loaders: Option<Vec<String>>,
    date_published: String,
    downloads: Option<u64>,
    version_type: Option<String>,
    files: Option<Vec<ModrinthFileItem>>,
    dependencies: Option<Vec<ModrinthDependencyItem>>,
}

#[derive(Deserialize)]
struct ModrinthFileItem {
    url: String,
    filename: String,
    size: u64,
    primary: Option<bool>,
}

// CurseForge Mod files JSON
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeModFilesResponse {
    data: Vec<CurseForgeFileItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeFileItem {
    id: u64,
    display_name: String,
    file_name: String,
    file_length: u64,
    file_date: String,
    download_url: Option<String>,
    download_count: Option<u64>,
    release_type: Option<u32>,
    game_versions: Option<Vec<String>>,
    #[allow(dead_code)]
    dependencies: Option<Vec<CurseForgeFileDependency>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeSingleModResponse {
    data: CurseForgeModDetail,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeDescriptionResponse {
    data: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeModDetail {
    id: u64,
    slug: String,
    name: String,
    summary: String,
    authors: Option<Vec<CurseForgeAuthor>>,
    logo: Option<CurseForgeLogo>,
    download_count: Option<f64>,
    thumbs_up_count: Option<u64>,
    categories: Option<Vec<CurseForgeCategory>>,
    date_created: Option<String>,
    date_modified: Option<String>,
    links: Option<CurseForgeLinks>,
    screenshots: Option<Vec<CurseForgeScreenshot>>,
    class_id: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeLinks {
    website_url: Option<String>,
    wiki_url: Option<String>,
    issues_url: Option<String>,
    source_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeScreenshot {
    title: Option<String>,
    description: Option<String>,
    url: String,
    thumbnail_url: Option<String>,
}

static DETAILS_CACHE: Mutex<Option<HashMap<String, (Instant, DiscoveryProjectDetails)>>> = Mutex::new(None);
static VERSIONS_CACHE: Mutex<Option<HashMap<String, (Instant, Vec<DiscoveryVersion>)>>> = Mutex::new(None);
const DETAILS_CACHE_TTL: u64 = 600;

pub async fn get_project_details(provider: &str, project_id: &str) -> Result<DiscoveryProjectDetails, String> {
    let cache_key = format!("{}:{}", provider.to_lowercase(), project_id);
    if let Ok(guard) = DETAILS_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if let Some((inserted, val)) = cache.get(&cache_key) {
                if inserted.elapsed() < Duration::from_secs(DETAILS_CACHE_TTL) {
                    return Ok(val.clone());
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let details = if provider.eq_ignore_ascii_case("curseforge") {
        get_curseforge_details(&client, project_id).await?
    } else {
        get_modrinth_details(&client, project_id).await?
    };

    if let Ok(mut guard) = DETAILS_CACHE.lock() {
        let cache = guard.get_or_insert_with(HashMap::new);
        if cache.len() > 80 {
            cache.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(DETAILS_CACHE_TTL));
        }
        cache.insert(cache_key, (Instant::now(), details.clone()));
    }

    Ok(details)
}

async fn get_modrinth_details(client: &reqwest::Client, project_id: &str) -> Result<DiscoveryProjectDetails, String> {
    let proj_url = format!("https://api.modrinth.com/v2/project/{}", project_id);
    let members_url = format!("https://api.modrinth.com/v2/project/{}/members", project_id);

    let (proj_res, members_res) = futures::join!(
        client.get(&proj_url).send(),
        client.get(&members_url).send()
    );

    let proj_res = proj_res.map_err(|e| format!("Modrinth project request failed: {}", e))?;
    if !proj_res.status().is_success() {
        return Err(format!("Modrinth project error: HTTP {}", proj_res.status()));
    }

    let p: ModrinthProjectData = proj_res.json().await.map_err(|e| e.to_string())?;

    let creators = if let Ok(m_res) = members_res {
        if let Ok(members) = m_res.json::<Vec<ModrinthMemberItem>>().await {
            members.into_iter().map(|m| DiscoveryAuthor {
                id: m.user.id.clone(),
                name: m.user.username.clone(),
                avatar_url: m.user.avatar_url,
                role: m.role,
                url: Some(format!("https://modrinth.com/user/{}", m.user.username)),
            }).collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let author_name = creators.first().map(|c| c.name.clone()).unwrap_or_else(|| "Unknown".to_string());
    let mut categories = p.categories.unwrap_or_default();
    if let Some(add_cats) = p.additional_categories {
        for c in add_cats {
            if !categories.contains(&c) {
                categories.push(c);
            }
        }
    }

    let gallery = p.gallery.unwrap_or_default().into_iter().map(|g| DiscoveryGalleryItem {
        title: g.title,
        description: g.description,
        url: g.url,
        thumbnail_url: g.raw_url,
        featured: g.featured,
    }).collect();

    let donate_link = p.donation_urls.as_ref().and_then(|d| d.first().map(|item| item.url.clone()));

    let env = {
        let client = p.client_side.as_deref().unwrap_or("optional");
        let server = p.server_side.as_deref().unwrap_or("optional");
        if client != "unsupported" && server != "unsupported" {
            Some("both".to_string())
        } else if client != "unsupported" {
            Some("client".to_string())
        } else if server != "unsupported" {
            Some("server".to_string())
        } else {
            None
        }
    };

    let web_url = format!("https://modrinth.com/{}/{}", p.project_type, p.slug);
    let report_url = format!("https://modrinth.com/{}/{}/report", p.project_type, p.slug);

    Ok(DiscoveryProjectDetails {
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.description,
        description: p.body.unwrap_or_default(),
        description_type: "markdown".to_string(),
        author: author_name,
        icon_url: p.icon_url,
        downloads: p.downloads,
        follows: p.followers,
        source: "modrinth".to_string(),
        project_type: p.project_type,
        categories,
        supported_loaders: p.loaders.unwrap_or_default(),
        supported_versions: p.game_versions.unwrap_or_default(),
        environment: env,
        links: DiscoveryLinks {
            website: None,
            source: p.source_url,
            issues: p.issues_url,
            wiki: p.wiki_url,
            discord: p.discord_url,
            donate: donate_link,
        },
        creators,
        license: p.license.map(|l| DiscoveryLicense {
            name: l.name.unwrap_or_else(|| "Custom".to_string()),
            url: l.url,
        }),
        published_date: p.published,
        updated_date: p.updated,
        gallery,
        web_url,
        report_url,
    })
}

async fn get_curseforge_details(client: &reqwest::Client, project_id: &str) -> Result<DiscoveryProjectDetails, String> {
    let mod_id = if let Ok(num) = project_id.parse::<u64>() {
        num
    } else {
        let search_url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&slug={}",
            urlencoding::encode(project_id)
        );
        let res = client.get(&search_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await.map_err(|e| e.to_string())?;
        let output: CurseForgeSearchOutput = res.json().await.map_err(|e| e.to_string())?;
        output.data.first().map(|m| m.id).ok_or_else(|| format!("CurseForge project not found: {}", project_id))?
    };

    let mod_url = format!("https://api.curseforge.com/v1/mods/{}", mod_id);
    let desc_url = format!("https://api.curseforge.com/v1/mods/{}/description", mod_id);

    let (mod_res, desc_res) = futures::join!(
        client.get(&mod_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send(),
        client.get(&desc_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send()
    );

    let m_data: CurseForgeSingleModResponse = mod_res.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let m = m_data.data;

    let desc_html = if let Ok(d_res) = desc_res {
        d_res.json::<CurseForgeDescriptionResponse>().await.map(|d| d.data).unwrap_or_default()
    } else {
        m.summary.clone()
    };

    let categories = m.categories.unwrap_or_default().into_iter().map(|c| c.name).collect();
    let authors = m.authors.unwrap_or_default().into_iter().map(|a| DiscoveryAuthor {
        id: a.name.clone(),
        name: a.name,
        avatar_url: None,
        role: Some("Author".to_string()),
        url: None,
    }).collect::<Vec<_>>();

    let author_name = authors.first().map(|a| a.name.clone()).unwrap_or_else(|| "Unknown".to_string());

    let gallery = m.screenshots.unwrap_or_default().into_iter().map(|s| DiscoveryGalleryItem {
        title: s.title,
        description: s.description,
        url: s.url,
        thumbnail_url: s.thumbnail_url,
        featured: None,
    }).collect();

    let project_type = match m.class_id.unwrap_or(6) {
        4471 => "modpack",
        6 => "mod",
        12 => "resourcepack",
        6552 => "shader",
        _ => "mod",
    }.to_string();

    let links = m.links.map(|l| DiscoveryLinks {
        website: l.website_url.clone(),
        source: l.source_url,
        issues: l.issues_url,
        wiki: l.wiki_url,
        discord: None,
        donate: None,
    }).unwrap_or_else(|| DiscoveryLinks {
        website: None,
        source: None,
        issues: None,
        wiki: None,
        discord: None,
        donate: None,
    });

    let web_url = links.website.clone().unwrap_or_else(|| format!("https://www.curseforge.com/minecraft/mc-mods/{}", m.slug));
    let report_url = format!("{}/report", web_url);

    Ok(DiscoveryProjectDetails {
        id: m.id.to_string(),
        slug: m.slug,
        title: m.name,
        summary: m.summary,
        description: desc_html,
        description_type: "html".to_string(),
        author: author_name,
        icon_url: m.logo.and_then(|l| l.thumbnail_url.or(l.url)),
        downloads: m.download_count.unwrap_or(0.0) as u64,
        follows: m.thumbs_up_count,
        source: "curseforge".to_string(),
        project_type,
        categories,
        supported_loaders: Vec::new(),
        supported_versions: Vec::new(),
        environment: None,
        links,
        creators: authors,
        license: None,
        published_date: m.date_created,
        updated_date: m.date_modified,
        gallery,
        web_url,
        report_url,
    })
}

pub async fn get_project_versions(
    provider: &str,
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<DiscoveryVersion>, String> {
    let cache_key = format!("{}:{}:{}:{}", provider.to_lowercase(), project_id, mc_version.unwrap_or(""), loader.unwrap_or(""));
    if let Ok(guard) = VERSIONS_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if let Some((inserted, val)) = cache.get(&cache_key) {
                if inserted.elapsed() < Duration::from_secs(300) {
                    return Ok(val.clone());
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let versions = if provider.eq_ignore_ascii_case("curseforge") {
        get_curseforge_versions(&client, project_id, mc_version, loader).await?
    } else {
        get_modrinth_versions(&client, project_id, mc_version, loader).await?
    };

    if let Ok(mut guard) = VERSIONS_CACHE.lock() {
        let cache = guard.get_or_insert_with(HashMap::new);
        if cache.len() > 80 {
            cache.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(300));
        }
        cache.insert(cache_key, (Instant::now(), versions.clone()));
    }

    Ok(versions)
}

async fn get_modrinth_versions(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<DiscoveryVersion>, String> {
    let mut url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
    let mut params = Vec::new();

    if let Some(v) = mc_version {
        if !v.is_empty() && v != "all" {
            params.push(format!("game_versions=[%22{}%22]", urlencoding::encode(v)));
        }
    }
    if let Some(l) = loader {
        if !l.is_empty() && l != "all" && l != "vanilla" {
            params.push(format!("loaders=[%22{}%22]", urlencoding::encode(&l.to_lowercase())));
        }
    }

    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    let res = client.get(&url).send().await.map_err(|e| format!("Modrinth versions error: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Modrinth error HTTP {}", res.status()));
    }

    let items: Vec<ModrinthVersionItem> = res.json().await.map_err(|e| e.to_string())?;

    let versions = items.into_iter().filter_map(|v| {
        let files = v.files?;
        let primary_file = files.iter().find(|f| f.primary.unwrap_or(false)).or_else(|| files.first())?;

        Some(DiscoveryVersion {
            id: v.id,
            name: v.name,
            version_number: v.version_number,
            game_versions: v.game_versions.unwrap_or_default(),
            loaders: v.loaders.unwrap_or_default(),
            date_published: v.date_published,
            file_size: primary_file.size,
            download_url: primary_file.url.clone(),
            file_name: primary_file.filename.clone(),
            version_type: v.version_type.unwrap_or_else(|| "release".to_string()),
            downloads: v.downloads,
        })
    }).collect();

    Ok(versions)
}

async fn get_curseforge_versions(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<DiscoveryVersion>, String> {
    let mod_id = if let Ok(num) = project_id.parse::<u64>() {
        num
    } else {
        let search_url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&slug={}",
            urlencoding::encode(project_id)
        );
        let res = client.get(&search_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await.map_err(|e| e.to_string())?;
        let output: CurseForgeSearchOutput = res.json().await.map_err(|e| e.to_string())?;
        output.data.first().map(|m| m.id).ok_or_else(|| format!("CurseForge mod not found: {}", project_id))?
    };

    let mut url = format!("https://api.curseforge.com/v1/mods/{}/files?pageSize=50", mod_id);
    if let Some(v) = mc_version {
        if !v.is_empty() && v != "all" {
            url.push_str(&format!("&gameVersion={}", urlencoding::encode(v)));
        }
    }
    if let Some(l) = loader {
        let l_type = match l.to_lowercase().as_str() {
            "forge" => Some("1"),
            "fabric" => Some("4"),
            "quilt" => Some("5"),
            "neoforge" => Some("6"),
            _ => None,
        };
        if let Some(lt) = l_type {
            url.push_str(&format!("&modLoaderType={}", lt));
        }
    }

    let res = client.get(&url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("CurseForge files error HTTP {}", res.status()));
    }

    let files_resp: CurseForgeModFilesResponse = res.json().await.map_err(|e| e.to_string())?;

    let versions = files_resp.data.into_iter().map(|f| {
        let dl_url = f.download_url.unwrap_or_else(|| {
            format!("https://edge.forgecdn.net/files/{}/{}/{}", f.id / 1000, f.id % 1000, f.file_name)
        });

        let g_vers = f.game_versions.unwrap_or_default();
        let mut loaders = Vec::new();
        let mut mc_vers = Vec::new();

        for g in g_vers {
            let lower = g.to_lowercase();
            if lower == "fabric" || lower == "forge" || lower == "neoforge" || lower == "quilt" {
                loaders.push(g);
            } else if g.contains('.') && !lower.contains("java") {
                mc_vers.push(g);
            }
        }

        let v_type = match f.release_type.unwrap_or(1) {
            1 => "release",
            2 => "beta",
            3 => "alpha",
            _ => "release",
        }.to_string();

        DiscoveryVersion {
            id: f.id.to_string(),
            name: f.display_name,
            version_number: f.file_name.clone(),
            game_versions: mc_vers,
            loaders,
            date_published: f.file_date,
            file_size: f.file_length,
            download_url: dl_url,
            file_name: f.file_name,
            version_type: v_type,
            downloads: f.download_count,
        }
    }).collect();

    Ok(versions)
}

#[derive(Clone, Debug, Default, Deserialize)]
struct FabricModMetadata {
    id: Option<String>,
    version: Option<String>,
    name: Option<String>,
    provides: Option<Vec<String>>,
}

/// Scans the instance .minecraft/mods folder and inspects each jar archive
/// to discover installed mod IDs, provided submodules, and version strings.
pub fn scan_installed_mods(mods_dir: &Path) -> HashMap<String, (String, PathBuf)> {
    let mut map = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("jar") {
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                // Store base stem
                map.insert(stem.clone(), ("unknown".to_string(), path.clone()));

                // Open archive to read metadata
                if let Ok(file) = std::fs::File::open(&path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(file) {
                        // Check fabric.mod.json
                        if let Ok(mut mod_json) = archive.by_name("fabric.mod.json") {
                            use std::io::Read;
                            let mut buf = String::new();
                            if mod_json.read_to_string(&mut buf).is_ok() {
                                if let Some(parsed) = parse_lenient_json::<FabricModMetadata>(&buf) {
                                    let ver = parsed.version.unwrap_or_else(|| "1.0.0".to_string());
                                    if let Some(id) = parsed.id {
                                        map.insert(id.to_lowercase(), (ver.clone(), path.clone()));
                                    }
                                    if let Some(name) = parsed.name {
                                        map.insert(name.to_lowercase(), (ver.clone(), path.clone()));
                                    }
                                    if let Some(provides) = parsed.provides {
                                        for p in provides {
                                            map.insert(p.to_lowercase(), (ver.clone(), path.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    map
}

/// Simple version comparison: returns true if v1 is strictly older than v2
#[allow(dead_code)]
fn is_version_older(v1: &str, v2: &str) -> bool {
    let p1: Vec<u64> = v1.split(|c: char| !c.is_ascii_digit()).filter_map(|s| s.parse().ok()).collect();
    let p2: Vec<u64> = v2.split(|c: char| !c.is_ascii_digit()).filter_map(|s| s.parse().ok()).collect();
    let len = p1.len().min(p2.len());
    for i in 0..len {
        if p1[i] < p2[i] {
            return true;
        } else if p1[i] > p2[i] {
            return false;
        }
    }
    p1.len() < p2.len()
}

/// Installs a project file and automatically checks and downloads any required dependencies
/// that are missing or outdated, including base loader libraries like Legacy Fabric API.
pub async fn install_project_with_dependencies(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
    download_url: &str,
    file_name: &str,
    provider: Option<&str>,
    project_id: Option<&str>,
    version_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut installed_list = Vec::new();

    // 1. Install primary file
    install_file_to_instance(app, instance_id, project_type, download_url, file_name, provider, project_id, version_id).await?;
    installed_list.push(file_name.to_string());

    if !project_type.eq_ignore_ascii_case("mods") && !project_type.eq_ignore_ascii_case("mod") {
        return Ok(installed_list);
    }

    // 2. Read instance metadata
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    let inst_data = std::fs::read_to_string(&inst_file).map_err(|e| e.to_string())?;
    let instance: crate::instances::Instance = serde_json::from_str(&inst_data).map_err(|e| e.to_string())?;

    let mc_version = &instance.mc_version;
    let loader = instance.loader.as_deref().unwrap_or("").to_lowercase();
    let mc_mods = crate::instances::get_instance_game_dir(&inst_dir).join("mods");

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // 3. Scan installed mods and index configurations
    let mut installed_map = scan_installed_mods(&mc_mods);
    let mut installed_identifiers = std::collections::HashSet::new();
    for (k, _) in &installed_map {
        installed_identifiers.insert(k.to_lowercase());
    }

    let index_dir = mc_mods.join(".index");
    if let Ok(entries) = std::fs::read_dir(&index_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("conf") {
                if let Ok(content) = std::fs::read_to_string(&p) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("project_id =") || trimmed.starts_with("name =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                let clean = val.trim().trim_matches(|c| c == '"' || c == '\'').to_lowercase();
                                if !clean.is_empty() {
                                    installed_identifiers.insert(clean);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. Resolve API-declared required dependencies (recursively up to 4 levels)
    let prov = provider.unwrap_or("modrinth");
    if prov.eq_ignore_ascii_case("modrinth") {
        // Resolve initial version ID if not explicitly provided
        let initial_version_id = version_id.map(|s| s.to_string()).or_else(|| {
            if download_url.contains("/versions/") {
                download_url
                    .split("/versions/")
                    .nth(1)
                    .and_then(|rest| rest.split('/').next())
                    .map(|s| s.to_string())
            } else {
                None
            }
        });

        let mut version_queue = std::collections::VecDeque::new();
        let mut visited_versions = std::collections::HashSet::new();
        let mut visited_projects = std::collections::HashSet::new();

        if let Some(ref pid) = project_id {
            visited_projects.insert(pid.to_lowercase());
        }

        if let Some(vid) = initial_version_id {
            version_queue.push_back(vid);
        } else if let Some(ref pid) = project_id {
            // Find version for project matching mc_version and loader
            if let Ok(p_versions) = get_project_versions("modrinth", pid, Some(mc_version), Some(&loader)).await {
                if let Some(best) = p_versions.iter().find(|v| v.file_name == file_name || v.download_url == download_url).or_else(|| p_versions.first()) {
                    version_queue.push_back(best.id.clone());
                }
            }
        }

        let mut depth_limit = 20; // Bound total dependency lookups to prevent runaway loops
        while let Some(curr_vid) = version_queue.pop_front() {
            if !visited_versions.insert(curr_vid.clone()) {
                continue;
            }
            depth_limit -= 1;
            if depth_limit <= 0 {
                break;
            }

            let v_url = format!("https://api.modrinth.com/v2/version/{}", curr_vid);
            if let Ok(res) = client.get(&v_url).send().await {
                if let Ok(v_data) = res.json::<ModrinthVersionItem>().await {
                    if let Some(deps) = v_data.dependencies {
                        for dep in deps {
                            if dep.dependency_type == "required" {
                                if let Some(dep_proj_id) = dep.project_id {
                                    let pid_lower = dep_proj_id.to_lowercase();
                                    let already_have = installed_identifiers.contains(&pid_lower)
                                        || installed_map.contains_key(&pid_lower)
                                        || visited_projects.contains(&pid_lower);

                                    if !already_have {
                                        visited_projects.insert(pid_lower.clone());
                                        if let Ok(dep_versions) = get_project_versions("modrinth", &dep_proj_id, Some(mc_version), Some(&loader)).await {
                                            if let Some(best_ver) = dep_versions.iter().find(|v| v.version_type.eq_ignore_ascii_case("release")).or_else(|| dep_versions.first()).cloned() {
                                                if let Ok(_) = install_file_to_instance(app, instance_id, "mods", &best_ver.download_url, &best_ver.file_name, Some("modrinth"), Some(&dep_proj_id), Some(&best_ver.id)).await {
                                                    installed_list.push(best_ver.file_name.clone());
                                                    installed_identifiers.insert(pid_lower.clone());
                                                    let stem = Path::new(&best_ver.file_name).file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                                                    installed_identifiers.insert(stem);
                                                    installed_map.insert(pid_lower, (best_ver.version_number, mc_mods.join(&best_ver.file_name)));
                                                    version_queue.push_back(best_ver.id);
                                                }
                                            }
                                        }
                                    }
                                } else if let Some(dep_ver_id) = dep.version_id {
                                    if !visited_versions.contains(&dep_ver_id) {
                                        version_queue.push_back(dep_ver_id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else if prov.eq_ignore_ascii_case("curseforge") {
        let cf_file_id: Option<u64> = version_id.and_then(|s| s.parse().ok()).or_else(|| {
            if download_url.contains("/files/") {
                let parts: Vec<&str> = download_url.split("/files/").nth(1).unwrap_or("").split('/').collect();
                if parts.len() >= 2 {
                    let high: u64 = parts[0].parse().ok()?;
                    let low: u64 = parts[1].parse().ok()?;
                    Some(high * 1000 + low)
                } else {
                    None
                }
            } else {
                None
            }
        });

        if let (Some(pid), Some(fid)) = (project_id, cf_file_id) {
            let cf_file_url = format!("https://api.curseforge.com/v1/mods/{}/files/{}", pid, fid);
            if let Ok(res) = client.get(&cf_file_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await {
                #[derive(Deserialize)]
                struct CfFileResponse {
                    data: CurseForgeFileItem,
                }
                if let Ok(file_data) = res.json::<CfFileResponse>().await {
                    if let Some(deps) = file_data.data.dependencies {
                        for dep in deps {
                            if dep.relation_type == 3 { // RequiredDependency
                                let dep_mod_id = dep.mod_id;
                                let dep_key = dep_mod_id.to_string();
                                if !installed_identifiers.contains(&dep_key) {
                                    installed_identifiers.insert(dep_key.clone());
                                    // Query files for this required dependency
                                    let dep_files_url = format!(
                                        "https://api.curseforge.com/v1/mods/{}/files?gameVersion={}&pageSize=15",
                                        dep_mod_id,
                                        urlencoding::encode(mc_version)
                                    );
                                    if let Ok(f_res) = client.get(&dep_files_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await {
                                        if let Ok(f_data) = f_res.json::<CurseForgeModFilesResponse>().await {
                                            if let Some(best_file) = f_data.data.iter().find(|f| {
                                                f.game_versions.as_ref().map_or(false, |gv| {
                                                    gv.iter().any(|v| v.eq_ignore_ascii_case(mc_version))
                                                        && (loader.is_empty() || gv.iter().any(|v| v.eq_ignore_ascii_case(&loader)))
                                                })
                                            }).or_else(|| f_data.data.first()) {
                                                let dl_url = best_file.download_url.clone().unwrap_or_else(|| {
                                                    format!("https://edge.forgecdn.net/files/{}/{}/{}", best_file.id / 1000, best_file.id % 1000, best_file.file_name)
                                                });
                                                if let Ok(_) = install_file_to_instance(app, instance_id, "mods", &dl_url, &best_file.file_name, Some("curseforge"), Some(&dep_key), Some(&best_file.id.to_string())).await {
                                                    installed_list.push(best_file.file_name.clone());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 5. Essential Base Loader API detection
    // Many legacy Fabric mods require Legacy Fabric API but do not explicitly declare it in Modrinth metadata
    if loader == "fabric" || loader == "quilt" {
        let is_legacy = mc_version.starts_with("1.8")
            || mc_version.starts_with("1.7")
            || mc_version.starts_with("1.6")
            || mc_version.starts_with("1.9")
            || mc_version.starts_with("1.10")
            || mc_version.starts_with("1.11")
            || mc_version.starts_with("1.12")
            || mc_version.starts_with("1.13")
            || mc_version.starts_with("b1.");

        if is_legacy {
            let has_legacy_api = installed_map.contains_key("legacy-fabric-api")
                || installed_map.contains_key("legacy-fabric-keybinding-api-v1-common")
                || installed_map.contains_key("legacy-fabric-api-base");

            if !has_legacy_api {
                // For Minecraft 1.8.9, use the dedicated stable Legacy Fabric API 1.4.0+1.8.9
                // Later all-in-one Modrinth builds embed incompatible 1.12 jars and require external OSL
                if mc_version == "1.8.9" {
                    let dl_url = "https://edge.forgecdn.net/files/3758/10/legacy-fabric-api-1.4.0%2b1.8.9.jar";
                    let f_name = "legacy-fabric-api-1.4.0+1.8.9.jar";
                    if let Ok(_) = install_file_to_instance(app, instance_id, "mods", dl_url, f_name, Some("curseforge"), Some("400281"), None).await {
                        installed_list.push(f_name.to_string());
                    }
                } else {
                    // Query CurseForge project 400281 files specifically matching game version
                    let cf_resolved = async {
                        let cf_url = format!("https://api.curseforge.com/v1/mods/400281/files?gameVersion={}", urlencoding::encode(mc_version));
                        let res = client.get(&cf_url).header("x-api-key", DEFAULT_CURSEFORGE_KEY).send().await.ok()?;
                        let parsed: CurseForgeModFilesResponse = res.json().await.ok()?;
                        let needle = format!("+{}", mc_version);
                        let file_item = parsed.data.iter().find(|f| f.file_name.contains(&needle))
                            .or_else(|| parsed.data.first())?;
                        let dl = file_item.download_url.clone().unwrap_or_else(|| {
                            format!("https://edge.forgecdn.net/files/{}/{}/{}", file_item.id / 1000, file_item.id % 1000, file_item.file_name)
                        });
                        Some((dl, file_item.file_name.clone()))
                    }.await;

                    if let Some((dl_url, f_name)) = cf_resolved {
                        if let Ok(_) = install_file_to_instance(app, instance_id, "mods", &dl_url, &f_name, Some("curseforge"), Some("400281"), None).await {
                            installed_list.push(f_name);
                        }
                    } else if let Ok(api_versions) = get_project_versions("modrinth", "9CJED7xi", Some(mc_version), Some("fabric")).await {
                        if let Some(best) = api_versions.iter().find(|v| v.version_type.eq_ignore_ascii_case("release")).or_else(|| api_versions.first()).cloned() {
                            if let Ok(_) = install_file_to_instance(app, instance_id, "mods", &best.download_url, &best.file_name, Some("modrinth"), Some("9CJED7xi"), Some(&best.id)).await {
                                installed_list.push(best.file_name);
                            }
                        }
                    }
                }
            }
        } else {
            // Modern Fabric (1.14+)
            let has_fabric_api = installed_map.contains_key("fabric-api")
                || installed_map.contains_key("fabric")
                || installed_map.contains_key("fabric-resource-loader-v0");

            if !has_fabric_api {
                if let Ok(api_versions) = get_project_versions("modrinth", "P7dR8mSH", Some(mc_version), Some("fabric")).await {
                    if let Some(best) = api_versions.iter().find(|v| v.version_type.eq_ignore_ascii_case("release")).or_else(|| api_versions.first()).cloned() {
                        if let Ok(_) = install_file_to_instance(app, instance_id, "mods", &best.download_url, &best.file_name, Some("modrinth"), Some("9CJED7xi"), Some(&best.id)).await {
                            installed_list.push(best.file_name);
                        }
                    }
                }
            }
        }
    }

    Ok(installed_list)
}


/// Scans the instance addon folder (mods, resourcepacks, shaderpacks) and returns
/// all known installed project IDs, slugs, stems, and mod IDs in lowercase.
pub fn get_installed_addon_ids(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
) -> Result<Vec<String>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    let mut ids = std::collections::HashSet::new();

    if !sub_dir.exists() {
        return Ok(Vec::new());
    }

    let index_dir = sub_dir.join(".index");

    if let Ok(entries) = std::fs::read_dir(&sub_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "jar" || ext_lower == "zip" {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            let stem_lower = stem.to_lowercase();
                            ids.insert(stem_lower.clone());

                            // Strip version suffix patterns like -1.2.3 or +1.20
                            if let Some(idx) = stem_lower.find('-') {
                                ids.insert(stem_lower[..idx].to_string());
                            }
                            if let Some(idx) = stem_lower.find('_') {
                                ids.insert(stem_lower[..idx].to_string());
                            }

                            // Check .index/{stem}.conf
                            let conf_file = index_dir.join(format!("{}.conf", stem));
                            if conf_file.exists() {
                                if let Ok(conf_data) = std::fs::read_to_string(&conf_file) {
                                    for line in conf_data.lines() {
                                        let trimmed = line.trim();
                                        if trimmed.starts_with("project_id =") || trimmed.starts_with("name =") {
                                            if let Some(val) = trimmed.split('=').nth(1) {
                                                let cleaned = val.trim().trim_matches(|c| c == '"' || c == '\'').to_lowercase();
                                                if !cleaned.is_empty() {
                                                    ids.insert(cleaned);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if project_type.eq_ignore_ascii_case("mods") || project_type.eq_ignore_ascii_case("mod") {
        let mod_map = scan_installed_mods(&sub_dir);
        for (k, _) in mod_map {
            ids.insert(k.to_lowercase());
        }
    }

    Ok(ids.into_iter().collect())
}


#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddonItem {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub size_bytes: u64,
    pub enabled: bool,
    pub mod_id: Option<String>,
    pub date_modified: Option<String>,
    pub source: Option<String>,
    pub icon_url: Option<String>,
    pub project_id: Option<String>,
}

static INSTALLED_ADDONS_CACHE: Mutex<Option<HashMap<PathBuf, (u64, u64, bool, InstalledAddonItem)>>> = Mutex::new(None);

/// Parses JSON leniently by escaping raw unescaped control characters in string literals
fn parse_lenient_json<T: for<'de> Deserialize<'de>>(raw: &str) -> Option<T> {
    if let Ok(parsed) = serde_json::from_str::<T>(raw) {
        return Some(parsed);
    }

    let mut in_string = false;
    let mut escape = false;
    let mut sanitized = String::with_capacity(raw.len() + 32);

    for c in raw.chars() {
        if in_string {
            if escape {
                sanitized.push(c);
                escape = false;
            } else if c == '\\' {
                sanitized.push(c);
                escape = true;
            } else if c == '"' {
                sanitized.push(c);
                in_string = false;
            } else if c == '\n' {
                sanitized.push_str("\\n");
            } else if c == '\r' {
                sanitized.push_str("\\r");
            } else if c == '\t' {
                sanitized.push_str("\\t");
            } else {
                sanitized.push(c);
            }
        } else {
            if c == '"' {
                in_string = true;
            }
            sanitized.push(c);
        }
    }

    serde_json::from_str::<T>(&sanitized).ok()
}

/// Inspects a mod JAR archive and extracts the display name, version, description, and embedded icon
fn inspect_mod_archive<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    stem: &str,
) -> (String, Option<String>, Option<String>, Option<String>, Option<String>) {
    let mut name = stem.to_string();
    let mut mod_id = None;
    let mut version = None;
    let mut description = None;
    let mut declared_icon_path: Option<String> = None;

    // 1. Fabric: fabric.mod.json
    if let Ok(mut mod_json) = archive.by_name("fabric.mod.json") {
        let mut buf = String::new();
        if mod_json.read_to_string(&mut buf).is_ok() {
            #[derive(Deserialize)]
            struct ModMeta {
                id: Option<String>,
                name: Option<String>,
                version: Option<String>,
                description: Option<String>,
                icon: Option<serde_json::Value>,
            }
            if let Some(parsed) = parse_lenient_json::<ModMeta>(&buf) {
                if let Some(n) = parsed.name {
                    if !n.trim().is_empty() {
                        name = n.trim().to_string();
                    }
                }
                mod_id = parsed.id;
                version = parsed.version;
                description = parsed.description;

                if let Some(icon_val) = parsed.icon {
                    if let Some(s) = icon_val.as_str() {
                        declared_icon_path = Some(s.to_string());
                    } else if let Some(obj) = icon_val.as_object() {
                        if let Some(best) = obj.get("128").or_else(|| obj.get("64")).or_else(|| obj.values().next()) {
                            if let Some(s) = best.as_str() {
                                declared_icon_path = Some(s.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Quilt: quilt.mod.json
    if mod_id.is_none() {
        if let Ok(mut quilt_json) = archive.by_name("quilt.mod.json") {
            let mut buf = String::new();
            if quilt_json.read_to_string(&mut buf).is_ok() {
                #[derive(Deserialize)]
                struct QuiltMeta {
                    quilt_loader: Option<QuiltLoaderPart>,
                }
                #[derive(Deserialize)]
                struct QuiltLoaderPart {
                    id: Option<String>,
                    version: Option<String>,
                    metadata: Option<QuiltInnerMeta>,
                }
                #[derive(Deserialize)]
                struct QuiltInnerMeta {
                    name: Option<String>,
                    description: Option<String>,
                    icon: Option<String>,
                }
                if let Some(parsed) = parse_lenient_json::<QuiltMeta>(&buf) {
                    if let Some(loader_part) = parsed.quilt_loader {
                        mod_id = loader_part.id;
                        version = loader_part.version;
                        if let Some(meta) = loader_part.metadata {
                            if let Some(n) = meta.name {
                                if !n.trim().is_empty() {
                                    name = n.trim().to_string();
                                }
                            }
                            description = meta.description;
                            declared_icon_path = meta.icon;
                        }
                    }
                }
            }
        }
    }

    // 3. Forge / NeoForge: META-INF/mods.toml
    if mod_id.is_none() {
        if let Ok(mut toml_file) = archive.by_name("META-INF/mods.toml") {
            let mut buf = String::new();
            if toml_file.read_to_string(&mut buf).is_ok() {
                for line in buf.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("displayName =") || trimmed.starts_with("displayName=") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let n = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            if !n.is_empty() {
                                name = n.to_string();
                            }
                        }
                    } else if trimmed.starts_with("modId =") || trimmed.starts_with("modId=") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let id = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            if !id.is_empty() {
                                mod_id = Some(id.to_string());
                            }
                        }
                    } else if trimmed.starts_with("version =") || trimmed.starts_with("version=") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let ver = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            if !ver.is_empty() && ver != "${file.jarVersion}" {
                                version = Some(ver.to_string());
                            }
                        }
                    } else if trimmed.starts_with("logoFile =") || trimmed.starts_with("logoFile=") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let logo = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            if !logo.is_empty() {
                                declared_icon_path = Some(logo.to_string());
                            }
                        }
                    } else if trimmed.starts_with("description =") || trimmed.starts_with("description=") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let desc = val.trim().trim_matches(|c| c == '"' || c == '\'');
                            if !desc.is_empty() && description.is_none() {
                                description = Some(desc.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. Legacy Forge: mcmod.info
    if mod_id.is_none() {
        if let Ok(mut mcmod_file) = archive.by_name("mcmod.info") {
            let mut buf = String::new();
            if mcmod_file.read_to_string(&mut buf).is_ok() {
                #[derive(Deserialize)]
                struct McModInfoItem {
                    modid: Option<String>,
                    name: Option<String>,
                    version: Option<String>,
                    description: Option<String>,
                    #[serde(rename = "logoFile")]
                    logo_file: Option<String>,
                }
                if let Some(parsed) = parse_lenient_json::<Vec<McModInfoItem>>(&buf) {
                    if let Some(first) = parsed.into_iter().next() {
                        if let Some(n) = first.name {
                            if !n.trim().is_empty() {
                                name = n.trim().to_string();
                            }
                        }
                        mod_id = first.modid;
                        version = first.version;
                        description = first.description;
                        declared_icon_path = first.logo_file;
                    }
                }
            }
        }
    }

    // 5. Clean up name if it still matches the raw filename stem
    if name == stem {
        if let Some(ref mid) = mod_id {
            // Capitalize mod id e.g. "picturemode" -> "Picturemode"
            let mut chars = mid.chars();
            if let Some(first) = chars.next() {
                name = format!("{}{}", first.to_uppercase(), chars.as_str());
            }
        }
    }

    // 6. Deep image search for embedded mod icons
    let mut icon_data_url = None;
    let mut candidate_paths = Vec::new();

    if let Some(ref p) = declared_icon_path {
        let cleaned = p.trim().trim_start_matches('/').trim_start_matches("./");
        candidate_paths.push(cleaned.to_string());
        if let Some(ref mid) = mod_id {
            candidate_paths.push(format!("assets/{}/{}", mid, cleaned));
            candidate_paths.push(format!("assets/{}/icon.png", mid));
            candidate_paths.push(format!("assets/{}/logo.png", mid));
        }
    }

    if let Some(ref mid) = mod_id {
        candidate_paths.push(format!("assets/{}/icon.png", mid));
        candidate_paths.push(format!("assets/{}/logo.png", mid));
        candidate_paths.push(format!("assets/{}/textures/gui/icon.png", mid));
    }

    candidate_paths.push("icon.png".to_string());
    candidate_paths.push("logo.png".to_string());
    candidate_paths.push("pack.png".to_string());

    for cand in candidate_paths {
        if let Ok(mut icon_file) = archive.by_name(&cand) {
            if icon_file.size() > 0 && icon_file.size() < 1_500_000 {
                let mut bytes = Vec::with_capacity(icon_file.size() as usize);
                if icon_file.read_to_end(&mut bytes).is_ok() {
                    let mime = if cand.ends_with(".jpg") || cand.ends_with(".jpeg") {
                        "image/jpeg"
                    } else {
                        "image/png"
                    };
                    icon_data_url = Some(format!("data:{};base64,{}", mime, base64_encode(&bytes)));
                    break;
                }
            }
        }
    }

    // If still no icon found, scan all entries in the archive for any icon.png or logo.png under assets/
    if icon_data_url.is_none() {
        for i in 0..archive.len() {
            if let Ok(mut icon_file) = archive.by_index(i) {
                let fname = icon_file.name().to_string();
                let lower = fname.to_lowercase();
                if (lower.ends_with("/icon.png") || lower.ends_with("/logo.png") || lower.ends_with("/pack.png"))
                    && icon_file.size() > 0 && icon_file.size() < 1_500_000
                {
                    let mut bytes = Vec::with_capacity(icon_file.size() as usize);
                    if icon_file.read_to_end(&mut bytes).is_ok() {
                        let mime = if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
                            "image/jpeg"
                        } else {
                            "image/png"
                        };
                        icon_data_url = Some(format!("data:{};base64,{}", mime, base64_encode(&bytes)));
                        break;
                    }
                }
            }
        }
    }

    (name, mod_id, version, description, icon_data_url)
}

/// Lists all installed addon files in the instance directory (including .disabled files)
/// with metadata parsed from .index configs and JAR archives, using an in-memory mtime cache
/// to keep loading instantaneous even with 50+ installed mods.
pub fn get_installed_addons_list(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
) -> Result<Vec<InstalledAddonItem>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    if !sub_dir.exists() {
        return Ok(Vec::new());
    }

    let index_dir = sub_dir.join(".index");
    let mut items = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&sub_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_disabled = file_name.ends_with(".disabled");
            let clean_name = if is_disabled {
                file_name.trim_end_matches(".disabled").to_string()
            } else {
                file_name.clone()
            };

            let ext = clean_name.rsplit('.').next().unwrap_or("").to_lowercase();
            if ext != "jar" && ext != "zip" {
                continue;
            }

            let meta = entry.metadata().ok();
            let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mtime_secs = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            // Fast-path: check memory cache by (path, mtime, size, is_disabled)
            if let Ok(guard) = INSTALLED_ADDONS_CACHE.lock() {
                if let Some(cache) = guard.as_ref() {
                    if let Some((c_mtime, c_size, c_disabled, item)) = cache.get(&path) {
                        if *c_mtime == mtime_secs && *c_size == size_bytes && *c_disabled == is_disabled {
                            items.push(item.clone());
                            continue;
                        }
                    }
                }
            }

            let date_modified = if mtime_secs > 0 { Some(format!("{}", mtime_secs)) } else { None };
            let stem = clean_name.strip_suffix(&format!(".{}", ext)).unwrap_or(&clean_name).to_string();

            // Default values
            let mut name = stem.clone();
            let mut version = None;
            let mut description = None;
            let mut source = None;
            let mut mod_id = None;
            let mut icon_url = None;
            let mut project_id = None;

            // 1. Try reading .index/{stem}.conf
            let conf_file = index_dir.join(format!("{}.conf", stem));
            if conf_file.exists() {
                if let Ok(conf_data) = std::fs::read_to_string(&conf_file) {
                    for line in conf_data.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("name =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                let n = val.trim().trim_matches(|c| c == '"' || c == '\'');
                                if !n.is_empty() && n != stem {
                                    name = n.to_string();
                                }
                            }
                        } else if trimmed.starts_with("provider =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                source = Some(val.trim().trim_matches(|c| c == '"' || c == '\'').to_string());
                            }
                        } else if trimmed.starts_with("project_id =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                let pid = val.trim().trim_matches(|c| c == '"' || c == '\'');
                                if !pid.is_empty() {
                                    project_id = Some(pid.to_string());
                                }
                            }
                        } else if trimmed.starts_with("icon_url =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                let u = val.trim().trim_matches(|c| c == '"' || c == '\'');
                                if !u.is_empty() {
                                    icon_url = Some(u.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // 2. Inspect archive for metadata and embedded icons
            if ext == "jar" {
                if let Ok(f) = std::fs::File::open(&path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(f) {
                        let (m_name, m_id, m_ver, m_desc, m_icon) = inspect_mod_archive(&mut archive, &stem);
                        if m_name != stem {
                            name = m_name;
                        }
                        if m_id.is_some() {
                            mod_id = m_id;
                        }
                        if m_ver.is_some() {
                            version = m_ver;
                        }
                        if m_desc.is_some() {
                            description = m_desc;
                        }
                        if icon_url.is_none() && m_icon.is_some() {
                            icon_url = m_icon;
                        }
                    }
                }
            } else if ext == "zip" {
                if let Ok(f) = std::fs::File::open(&path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(f) {
                        use std::io::Read;
                        for cand in ["pack.png", "icon.png", "logo.png"] {
                            if let Ok(mut icon_file) = archive.by_name(cand) {
                                if icon_file.size() > 0 && icon_file.size() < 1_500_000 {
                                    let mut bytes = Vec::with_capacity(icon_file.size() as usize);
                                    if icon_file.read_to_end(&mut bytes).is_ok() {
                                        icon_url = Some(format!("data:image/png;base64,{}", base64_encode(&bytes)));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let parsed_item = InstalledAddonItem {
                id: stem,
                name,
                file_name,
                version,
                description,
                size_bytes,
                enabled: !is_disabled,
                mod_id,
                date_modified,
                source,
                icon_url,
                project_id,
            };

            // Store in in-memory cache
            if let Ok(mut guard) = INSTALLED_ADDONS_CACHE.lock() {
                let cache = guard.get_or_insert_with(HashMap::new);
                cache.insert(path, (mtime_secs, size_bytes, is_disabled, parsed_item.clone()));
            }

            items.push(parsed_item);
        }
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

/// Toggles whether an installed addon is enabled or disabled by renaming
/// the file with or without the `.disabled` suffix.
pub fn toggle_addon_enabled(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
    file_name: &str,
    enabled: bool,
) -> Result<String, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    let current_path = sub_dir.join(file_name);
    if !current_path.exists() {
        return Err(format!("File {} not found", file_name));
    }

    let new_name = if enabled {
        file_name.trim_end_matches(".disabled").to_string()
    } else {
        if file_name.ends_with(".disabled") {
            file_name.to_string()
        } else {
            format!("{}.disabled", file_name)
        }
    };

    let target_path = sub_dir.join(&new_name);
    if current_path != target_path {
        std::fs::rename(&current_path, &target_path).map_err(|e| e.to_string())?;
    }

    Ok(new_name)
}

/// Deletes an addon file and any associated .index configuration.
pub fn delete_addon(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
    file_name: &str,
) -> Result<(), String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    let file_path = sub_dir.join(file_name);
    if file_path.exists() {
        let _ = std::fs::remove_file(&file_path);
    }

    let clean_name = file_name.trim_end_matches(".disabled");
    let stem = Path::new(clean_name).file_stem().and_then(|s| s.to_str()).unwrap_or(clean_name);
    let conf_path = sub_dir.join(".index").join(format!("{}.conf", stem));
    if conf_path.exists() {
        let _ = std::fs::remove_file(&conf_path);
    }

    Ok(())
}


#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonUpdateInfo {
    pub file_name: String,
    pub current_version: Option<String>,
    pub latest_version: String,
    pub latest_version_id: String,
    pub latest_download_url: String,
    pub latest_file_name: String,
    pub project_id: String,
    pub provider: String,
}

/// Checks for available updates for installed addons in an instance.
/// Verifies that any newer version strictly supports the instance's Minecraft version
/// and active mod loader, and returns only valid, compatible newer releases.
pub async fn check_addon_updates(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
) -> Result<Vec<AddonUpdateInfo>, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    if !inst_file.exists() {
        return Ok(Vec::new());
    }
    let inst_data = std::fs::read_to_string(&inst_file).map_err(|e| e.to_string())?;
    let instance: crate::instances::Instance = serde_json::from_str(&inst_data).map_err(|e| e.to_string())?;

    let mc_version = instance.mc_version.clone();
    let loader = if project_type.eq_ignore_ascii_case("mods") || project_type.eq_ignore_ascii_case("mod") {
        instance.loader.as_deref().filter(|l| !l.eq_ignore_ascii_case("vanilla") && !l.eq_ignore_ascii_case("none"))
    } else {
        None
    };

    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" | "resource_pack" | "resource-pack" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => mc_dir.join("shaderpacks"),
        _ => mc_dir.join("mods"),
    };

    let index_dir = sub_dir.join(".index");
    if !index_dir.exists() {
        return Ok(Vec::new());
    }

    let mut update_results = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&index_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|e| e.to_str()) != Some("conf") {
                continue;
            }

            if let Ok(data) = std::fs::read_to_string(&path) {
                let mut filename = String::new();
                let mut provider = String::new();
                let mut project_id = String::new();
                let mut current_version_id = String::new();
                let mut current_version = None;

                for line in data.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("filename =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            filename = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
                        }
                    } else if trimmed.starts_with("provider =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            provider = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
                        }
                    } else if trimmed.starts_with("project_id =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            project_id = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
                        }
                    } else if trimmed.starts_with("version_id =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            current_version_id = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
                        }
                    } else if trimmed.starts_with("version =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            current_version = Some(val.trim().trim_matches(|c| c == '"' || c == '\'').to_string());
                        }
                    }
                }

                // Verify target file actually exists in sub_dir
                let file_exists = sub_dir.join(&filename).exists() || sub_dir.join(format!("{}.disabled", filename)).exists();
                if !file_exists || project_id.is_empty() {
                    continue;
                }

                // Query compatible releases for this project
                let prov = if provider.is_empty() { "modrinth" } else { &provider };
                if let Ok(versions) = get_project_versions(prov, &project_id, Some(&mc_version), loader).await {
                    // Pick best release version matching Minecraft version
                    if let Some(latest) = versions.iter().find(|v| v.version_type.eq_ignore_ascii_case("release")).or_else(|| versions.first()) {
                        // Compare version identifiers
                        let is_newer = if !current_version_id.is_empty() {
                            latest.id != current_version_id
                        } else if let Some(cur_v) = &current_version {
                            latest.version_number != *cur_v
                        } else {
                            !filename.contains(&latest.version_number)
                        };

                        if is_newer && !latest.download_url.is_empty() {
                            update_results.push(AddonUpdateInfo {
                                file_name: filename,
                                current_version,
                                latest_version: latest.version_number.clone(),
                                latest_version_id: latest.id.clone(),
                                latest_download_url: latest.download_url.clone(),
                                latest_file_name: latest.file_name.clone(),
                                project_id: project_id.clone(),
                                provider: prov.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(update_results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiline_json_description_leniently() {
        let raw = r#"{
            "id": "picturemode",
            "name": "Picture Mode",
            "description": "This mod adds an isometric view.
Inspired by Photo Mode!",
            "icon": "assets/picturemode/icon.png"
        }"#;

        #[allow(dead_code)]
        #[derive(Deserialize)]
        struct TestMeta {
            id: String,
            name: String,
            description: String,
            icon: String,
        }

        let parsed = parse_lenient_json::<TestMeta>(raw);
        assert!(parsed.is_some(), "Expected lenient JSON parser to succeed on multiline string");
        let unwrapped = parsed.unwrap();
        assert_eq!(unwrapped.name, "Picture Mode");
        assert_eq!(unwrapped.icon, "assets/picturemode/icon.png");
        assert!(unwrapped.description.contains("Inspired by"));
    }
}
