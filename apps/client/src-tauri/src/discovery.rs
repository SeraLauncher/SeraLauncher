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
use std::collections::HashMap;
use std::path::PathBuf;
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

const DEFAULT_CURSEFORGE_KEY: &str = "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm";

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
pub async fn install_file_to_instance(
    app: &tauri::AppHandle,
    instance_id: &str,
    project_type: &str,
    download_url: &str,
    file_name: &str,
) -> Result<PathBuf, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let mc_dir = inst_dir.join(".minecraft");

    let sub_dir = match project_type.to_lowercase().as_str() {
        "mods" | "mod" => mc_dir.join("mods"),
        "resourcepack" | "resourcepacks" => mc_dir.join("resourcepacks"),
        "shader" | "shaders" => mc_dir.join("shaderpacks"),
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

    let res = client.get(download_url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Download returned status {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&target_file, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

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
