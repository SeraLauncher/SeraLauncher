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
use std::path::PathBuf;

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
struct CurseForgeSearchOutput {
    data: Vec<CurseForgeMod>,
    pagination: Option<CurseForgePagination>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct CurseForgePagination {
    total_count: Option<u64>,
    index: Option<u32>,
    page_size: Option<u32>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
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
struct CurseForgeAuthor {
    name: String,
}

#[derive(Deserialize)]
struct CurseForgeLogo {
    thumbnail_url: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize)]
struct CurseForgeCategory {
    name: String,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct CurseForgeFileIndex {
    game_version: Option<String>,
    mod_loader: Option<u32>,
}

const DEFAULT_CURSEFORGE_KEY: &str = "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm";

pub async fn search_projects(
    provider: &str,
    project_type: &str,
    query: Option<&str>,
    mc_version: Option<&str>,
    loader: Option<&str>,
    sort: Option<&str>,
    offset: u32,
    limit: u32,
) -> Result<DiscoverySearchResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.6")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    if provider.eq_ignore_ascii_case("curseforge") {
        return search_curseforge(&client, project_type, query, mc_version, loader, sort, offset, limit).await;
    }

    search_modrinth(&client, project_type, query, mc_version, loader, sort, offset, limit).await
}

async fn search_modrinth(
    client: &reqwest::Client,
    project_type: &str,
    query: Option<&str>,
    mc_version: Option<&str>,
    loader: Option<&str>,
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
