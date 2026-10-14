use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

use crate::discovery::{get_project_versions, install_project_with_dependencies, scan_installed_mods};
use crate::instances::Instance;
use crate::java::{inspect_java_binary, required_java_version};

static SAFETY_CACHE: Mutex<Option<HashMap<String, (u64, usize, SafetyReport)>>> = Mutex::new(None);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyIssue {
    pub issue_type: String, // "missing_dependency" | "incompatible_java" | "mod_conflict" | "version_mismatch"
    pub severity: String,   // "blocking" | "warning"
    pub source_mod: String,
    pub target_id: String,
    pub required_version: Option<String>,
    pub description: String,
    pub auto_resolvable: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyReport {
    pub is_safe: bool,
    pub issues: Vec<SafetyIssue>,
    pub installed_mods_count: usize,
    pub required_java_version: u32,
    pub configured_java_version: u32,
    pub is_java_compatible: bool,
}

#[derive(Deserialize)]
struct FabricModMeta {
    id: Option<String>,
    name: Option<String>,
    #[allow(dead_code)]
    version: Option<String>,
    depends: Option<HashMap<String, serde_json::Value>>,
    breaks: Option<HashMap<String, serde_json::Value>>,
    jars: Option<Vec<FabricNestedJar>>,
}

#[derive(Deserialize)]
struct FabricNestedJar {
    file: Option<String>,
}

#[derive(Deserialize)]
struct QuiltModMeta {
    quilt_loader: Option<QuiltLoaderPart>,
}

#[derive(Deserialize)]
struct QuiltLoaderPart {
    id: Option<String>,
    metadata: Option<QuiltMetaPart>,
    depends: Option<serde_json::Value>,
    #[allow(dead_code)]
    breaks: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct QuiltMetaPart {
    name: Option<String>,
}

fn parse_json_lenient<T: for<'de> Deserialize<'de>>(raw: &str) -> Option<T> {
    if let Ok(p) = serde_json::from_str::<T>(raw) {
        return Some(p);
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

/// Compares two version strings (e.g. "0.28.8" vs "0.28.5-")
/// Returns true if v1 is strictly older than v2.
fn is_version_older(v1: &str, v2: &str) -> bool {
    let p1: Vec<u64> = v1
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse().ok())
        .collect();
    let p2: Vec<u64> = v2
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse().ok())
        .collect();

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

/// Evaluates a Fabric `breaks` condition against an installed version.
/// Returns true if the installed version actually conflicts/breaks.
fn breaks_condition_met(installed_ver: &str, break_constraint: &str) -> bool {
    let trimmed = break_constraint.trim();
    if trimmed == "*" || trimmed.is_empty() {
        return true; // Absolute incompatibility
    }

    if let Some(rest) = trimmed.strip_prefix("<=") {
        let target = rest.trim();
        is_version_older(installed_ver, target) || installed_ver == target
    } else if let Some(rest) = trimmed.strip_prefix('<') {
        let target = rest.trim();
        is_version_older(installed_ver, target)
    } else if let Some(rest) = trimmed.strip_prefix(">=") {
        let target = rest.trim();
        !is_version_older(installed_ver, target)
    } else if let Some(rest) = trimmed.strip_prefix('>') {
        let target = rest.trim();
        !is_version_older(installed_ver, target) && installed_ver != target
    } else if let Some(rest) = trimmed.strip_prefix('=') {
        let target = rest.trim();
        installed_ver == target
    } else {
        false
    }
}

/// Validates an instance for missing dependencies, mod conflicts, and Java version compatibility
pub fn validate_instance_safety(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<SafetyReport, String> {
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    let inst_data = std::fs::read_to_string(&inst_file)
        .map_err(|e| format!("Failed to read instance.json: {}", e))?;
    let instance: Instance = serde_json::from_str(&inst_data)
        .map_err(|e| format!("Failed to parse instance.json: {}", e))?;

    let req_java = required_java_version(&instance.mc_version);
    let mut configured_java = 0u32;
    let mut is_java_compatible = true;

    // Check configured Java version
    if let Some(ref custom_path) = instance.custom_java_path {
        let p = Path::new(custom_path);
        if let Some(inspected) = inspect_java_binary(p) {
            configured_java = inspected.major_version;
            if req_java >= 25 {
                is_java_compatible = configured_java >= 25;
            } else if req_java >= 21 {
                is_java_compatible = configured_java >= 21;
            } else if req_java >= 17 {
                is_java_compatible = configured_java == 16 || configured_java == 17 || configured_java >= 17;
            } else {
                is_java_compatible = configured_java >= 8;
            }
        }
    }

    let mut issues = Vec::new();

    if !is_java_compatible && configured_java > 0 {
        issues.push(SafetyIssue {
            issue_type: "incompatible_java".to_string(),
            severity: "blocking".to_string(),
            source_mod: "Minecraft".to_string(),
            target_id: "java".to_string(),
            required_version: Some(format!("Java {}", req_java)),
            description: format!(
                "Minecraft {} requires Java {} or later, but the configured runtime is Java {}.",
                instance.mc_version, req_java, configured_java
            ),
            auto_resolvable: true,
        });
    }

    let mc_dir = crate::instances::get_instance_game_dir(&inst_dir);
    let mods_dir = mc_dir.join("mods");

    if !mods_dir.is_dir() {
        let is_safe = issues.is_empty();
        return Ok(SafetyReport {
            is_safe,
            issues,
            installed_mods_count: 0,
            required_java_version: req_java,
            configured_java_version: configured_java,
            is_java_compatible,
        });
    }

    // Check fast in-memory safety cache by mods directory mtime & file count
    let mods_meta = std::fs::metadata(&mods_dir).ok();
    let mods_mtime = mods_meta
        .and_then(|m| m.modified().ok())
        .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dir_entries_count = std::fs::read_dir(&mods_dir)
        .map(|e| e.count())
        .unwrap_or(0);

    if let Ok(guard) = SAFETY_CACHE.lock() {
        if let Some(ref cache) = *guard {
            if let Some((c_mtime, c_count, ref report)) = cache.get(instance_id) {
                if *c_mtime == mods_mtime && *c_count == dir_entries_count {
                    return Ok(report.clone());
                }
            }
        }
    }

    // 1. Collect installed mod IDs, submodules, and provides
    let installed_map = scan_installed_mods(&mods_dir);
    let mut available_ids = HashSet::new();

    for (k, _) in &installed_map {
        available_ids.insert(k.to_lowercase());
    }

    // Inspect nested jars inside mod JARs (e.g. Fabric API submodules)
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("jar") {
                if let Ok(f) = File::open(&p) {
                    if let Ok(mut archive) = zip::ZipArchive::new(f) {
                        let content_opt = {
                            if let Ok(mut fabric_json) = archive.by_name("fabric.mod.json") {
                                let mut content = String::new();
                                if fabric_json.read_to_string(&mut content).is_ok() {
                                    Some(content)
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        };

                        if let Some(content) = content_opt {
                            if let Some(parsed) = parse_json_lenient::<FabricModMeta>(&content) {
                                if let Some(nested) = parsed.jars {
                                    for n in nested {
                                        if let Some(file_path) = n.file {
                                            let stem = Path::new(&file_path)
                                                .file_stem()
                                                .and_then(|s| s.to_str())
                                                .unwrap_or("")
                                                .to_lowercase();
                                            if let Some(idx) = stem.find('-') {
                                                available_ids.insert(stem[..idx].to_string());
                                            }
                                            available_ids.insert(stem.clone());
                                            available_ids.insert(stem.replace('-', "_"));
                                            available_ids.insert(stem.replace('_', "-"));

                                            // Deep inspect inner jar for its real mod ID and provides
                                            if let Ok(mut inner_entry) = archive.by_name(&file_path) {
                                                if inner_entry.size() > 0 && inner_entry.size() < 10_000_000 {
                                                    let mut inner_bytes = Vec::with_capacity(inner_entry.size() as usize);
                                                    if inner_entry.read_to_end(&mut inner_bytes).is_ok() {
                                                        let cursor = std::io::Cursor::new(inner_bytes);
                                                        if let Ok(mut inner_archive) = zip::ZipArchive::new(cursor) {
                                                            if let Ok(mut inner_json) = inner_archive.by_name("fabric.mod.json") {
                                                                let mut inner_buf = String::new();
                                                                if inner_json.read_to_string(&mut inner_buf).is_ok() {
                                                                    #[derive(Deserialize)]
                                                                    struct InnerModMeta {
                                                                        id: Option<String>,
                                                                        provides: Option<Vec<String>>,
                                                                    }
                                                                    if let Some(inner_meta) = parse_json_lenient::<InnerModMeta>(&inner_buf) {
                                                                        if let Some(iid) = inner_meta.id {
                                                                            let low = iid.to_lowercase();
                                                                            available_ids.insert(low.clone());
                                                                            available_ids.insert(low.replace('-', "_"));
                                                                            available_ids.insert(low.replace('_', "-"));
                                                                        }
                                                                        if let Some(provides) = inner_meta.provides {
                                                                            for pr in provides {
                                                                                let low = pr.to_lowercase();
                                                                                available_ids.insert(low.clone());
                                                                                available_ids.insert(low.replace('-', "_"));
                                                                                available_ids.insert(low.replace('_', "-"));
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
                            }
                        }
                    }
                }
            }
        }
    }

    // Check if Fabric API is present
    let has_fabric_api = available_ids.contains("fabric-api")
        || available_ids.contains("fabric")
        || installed_map.contains_key("fabric-api")
        || installed_map.contains_key("fabric")
        || installed_map.keys().any(|k| k.starts_with("fabric-api"));

    let has_quilt_api = available_ids.contains("qsl")
        || available_ids.contains("quilted_fabric_api")
        || installed_map.contains_key("qsl")
        || installed_map.contains_key("quilted_fabric_api");

    // Also read .index/*.conf to know registered project IDs and names
    let index_dir = mods_dir.join(".index");
    if let Ok(entries) = std::fs::read_dir(&index_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("conf") {
                if let Ok(content) = std::fs::read_to_string(&p) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("project_id =") || trimmed.starts_with("name =") {
                            if let Some(val) = trimmed.split('=').nth(1) {
                                let c = val.trim().trim_matches(|ch| ch == '"' || ch == '\'').to_lowercase();
                                if !c.is_empty() {
                                    available_ids.insert(c);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut installed_count = 0;

    // 2. Scan every installed mod JAR for required dependencies and breaking conflicts
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let fname = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
            if fname.ends_with(".disabled") || !fname.ends_with(".jar") {
                continue;
            }

            installed_count += 1;

            if let Ok(f) = File::open(&path) {
                if let Ok(mut archive) = zip::ZipArchive::new(f) {
                    // 2a. Fabric mod inspection
                    if let Ok(mut fabric_json) = archive.by_name("fabric.mod.json") {
                        let mut content = String::new();
                        if fabric_json.read_to_string(&mut content).is_ok() {
                            if let Some(parsed) = parse_json_lenient::<FabricModMeta>(&content) {
                                let mod_title = parsed.name.as_deref().unwrap_or(
                                    parsed.id.as_deref().unwrap_or(fname)
                                );

                                if let Some(deps) = parsed.depends {
                                    for (req_id, req_val) in deps {
                                        let req_lower = req_id.to_lowercase();
                                        if is_system_dependency(&req_lower) {
                                            continue;
                                        }

                                        // If Fabric API is installed, it provides all fabric-* submodules
                                        if has_fabric_api && (req_lower.starts_with("fabric-") || req_lower.starts_with("fabric_")) {
                                            continue;
                                        }

                                        // If Quilt API is installed, it provides all quilt_* and qsl_* modules
                                        if has_quilt_api && (req_lower.starts_with("quilt_") || req_lower.starts_with("qsl_") || req_lower.starts_with("fabric-")) {
                                            continue;
                                        }

                                        if !available_ids.contains(&req_lower) && !installed_map.contains_key(&req_lower) {
                                            let ver_str = match req_val {
                                                serde_json::Value::String(s) => Some(s),
                                                serde_json::Value::Array(arr) => {
                                                    arr.first().and_then(|v| v.as_str()).map(|s| s.to_string())
                                                }
                                                _ => None,
                                            };

                                            issues.push(SafetyIssue {
                                                issue_type: "missing_dependency".to_string(),
                                                severity: "blocking".to_string(),
                                                source_mod: mod_title.to_string(),
                                                target_id: req_id.clone(),
                                                required_version: ver_str.clone(),
                                                description: format!(
                                                    "Mod '{}' requires '{}'{}, but it is not installed.",
                                                    mod_title,
                                                    req_id,
                                                    ver_str.map(|v| format!(" ({})", v)).unwrap_or_default()
                                                ),
                                                auto_resolvable: true,
                                            });
                                        }
                                    }
                                }

                                if let Some(breaks) = parsed.breaks {
                                    for (conflict_id, constraint_val) in breaks {
                                        let conf_lower = conflict_id.to_lowercase();
                                        if let Some((inst_ver, _)) = installed_map.get(&conf_lower) {
                                            let constraint_str = constraint_val.as_str().unwrap_or("*");
                                            if breaks_condition_met(inst_ver, constraint_str) {
                                                issues.push(SafetyIssue {
                                                    issue_type: "mod_conflict".to_string(),
                                                    severity: "blocking".to_string(),
                                                    source_mod: mod_title.to_string(),
                                                    target_id: conflict_id.clone(),
                                                    required_version: Some(constraint_str.to_string()),
                                                    description: format!(
                                                        "Mod '{}' conflicts with installed mod '{}' version {} (breaks: {}).",
                                                        mod_title, conflict_id, inst_ver, constraint_str
                                                    ),
                                                    auto_resolvable: false,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 2b. Quilt mod inspection
                    if let Ok(mut quilt_json) = archive.by_name("quilt.mod.json") {
                        let mut content = String::new();
                        if quilt_json.read_to_string(&mut content).is_ok() {
                            if let Some(parsed) = parse_json_lenient::<QuiltModMeta>(&content) {
                                if let Some(loader_part) = parsed.quilt_loader {
                                    let mod_title = loader_part
                                        .metadata
                                        .and_then(|m| m.name)
                                        .or(loader_part.id)
                                        .unwrap_or_else(|| fname.to_string());

                                    if let Some(deps_val) = loader_part.depends {
                                        extract_quilt_dependencies(&mod_title, &deps_val, &available_ids, &installed_map, &mut issues);
                                    }
                                }
                            }
                        }
                    }

                    // 2c. Forge / NeoForge mods.toml inspection
                    if let Ok(mut toml_file) = archive.by_name("META-INF/mods.toml") {
                        let mut content = String::new();
                        if toml_file.read_to_string(&mut content).is_ok() {
                            extract_forge_dependencies(&content, fname, &available_ids, &installed_map, &mut issues);
                        }
                    }
                }
            }
        }
    }

    // Deduplicate identical missing dependency recommendations
    let mut seen = HashSet::new();
    issues.retain(|i| seen.insert(format!("{}:{}", i.issue_type, i.target_id.to_lowercase())));

    let is_safe = !issues.iter().any(|i| i.severity == "blocking");

    let report = SafetyReport {
        is_safe,
        issues,
        installed_mods_count: installed_count,
        required_java_version: req_java,
        configured_java_version: configured_java,
        is_java_compatible,
    };

    if let Ok(mut guard) = SAFETY_CACHE.lock() {
        let cache = guard.get_or_insert_with(HashMap::new);
        cache.insert(instance_id.to_string(), (mods_mtime, dir_entries_count, report.clone()));
    }

    Ok(report)
}

fn is_system_dependency(id: &str) -> bool {
    matches!(
        id,
        "minecraft"
            | "java"
            | "fabricloader"
            | "fabric-loader"
            | "quilt_loader"
            | "quilt-loader"
            | "forge"
            | "neoforge"
    )
}

fn extract_quilt_dependencies(
    mod_title: &str,
    deps_val: &serde_json::Value,
    available_ids: &HashSet<String>,
    installed_map: &HashMap<String, (String, PathBuf)>,
    issues: &mut Vec<SafetyIssue>,
) {
    if let Some(arr) = deps_val.as_array() {
        for item in arr {
            if let Some(obj) = item.as_object() {
                if let Some(req_id) = obj.get("id").and_then(|v| v.as_str()) {
                    let req_lower = req_id.to_lowercase();
                    if is_system_dependency(&req_lower) {
                        continue;
                    }
                    if !available_ids.contains(&req_lower) && !installed_map.contains_key(&req_lower) {
                        let ver_str = obj.get("versions").and_then(|v| v.as_str()).map(|s| s.to_string());
                        issues.push(SafetyIssue {
                            issue_type: "missing_dependency".to_string(),
                            severity: "blocking".to_string(),
                            source_mod: mod_title.to_string(),
                            target_id: req_id.to_string(),
                            required_version: ver_str.clone(),
                            description: format!(
                                "Mod '{}' requires '{}'{}, but it is not installed.",
                                mod_title,
                                req_id,
                                ver_str.map(|v| format!(" ({})", v)).unwrap_or_default()
                            ),
                            auto_resolvable: true,
                        });
                    }
                }
            }
        }
    }
}

fn extract_forge_dependencies(
    content: &str,
    fname: &str,
    available_ids: &HashSet<String>,
    installed_map: &HashMap<String, (String, PathBuf)>,
    issues: &mut Vec<SafetyIssue>,
) {
    let mut in_dep = false;
    let mut curr_mod_id = String::new();
    let mut mandatory = false;
    let mut version_range = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[[dependencies.") {
            if in_dep && mandatory && !curr_mod_id.is_empty() {
                let req_lower = curr_mod_id.to_lowercase();
                if !is_system_dependency(&req_lower)
                    && !available_ids.contains(&req_lower)
                    && !installed_map.contains_key(&req_lower)
                {
                    issues.push(SafetyIssue {
                        issue_type: "missing_dependency".to_string(),
                        severity: "blocking".to_string(),
                        source_mod: fname.to_string(),
                        target_id: curr_mod_id.clone(),
                        required_version: version_range.clone(),
                        description: format!(
                            "Mod '{}' requires mandatory library '{}'{}, but it is not installed.",
                            fname,
                            curr_mod_id,
                            version_range.as_ref().map(|v| format!(" ({})", v)).unwrap_or_default()
                        ),
                        auto_resolvable: true,
                    });
                }
            }
            in_dep = true;
            curr_mod_id.clear();
            mandatory = false;
            version_range = None;
        } else if in_dep {
            if trimmed.starts_with("modId =") || trimmed.starts_with("modId=") {
                if let Some(val) = trimmed.split('=').nth(1) {
                    curr_mod_id = val.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
                }
            } else if trimmed.starts_with("mandatory =") || trimmed.starts_with("mandatory=") {
                if let Some(val) = trimmed.split('=').nth(1) {
                    mandatory = val.trim().eq_ignore_ascii_case("true");
                }
            } else if trimmed.starts_with("versionRange =") || trimmed.starts_with("versionRange=") {
                if let Some(val) = trimmed.split('=').nth(1) {
                    let v = val.trim().trim_matches(|c| c == '"' || c == '\'');
                    if !v.is_empty() {
                        version_range = Some(v.to_string());
                    }
                }
            }
        }
    }

    if in_dep && mandatory && !curr_mod_id.is_empty() {
        let req_lower = curr_mod_id.to_lowercase();
        if !is_system_dependency(&req_lower)
            && !available_ids.contains(&req_lower)
            && !installed_map.contains_key(&req_lower)
        {
            issues.push(SafetyIssue {
                issue_type: "missing_dependency".to_string(),
                severity: "blocking".to_string(),
                source_mod: fname.to_string(),
                target_id: curr_mod_id.clone(),
                required_version: version_range.clone(),
                description: format!(
                    "Mod '{}' requires mandatory library '{}'{}, but it is not installed.",
                    fname,
                    curr_mod_id,
                    version_range.map(|v| format!(" ({})", v)).unwrap_or_default()
                ),
                auto_resolvable: true,
            });
        }
    }
}

/// Automatically searches Modrinth/CurseForge and installs all resolvable missing dependencies for an instance
pub async fn resolve_missing_dependencies(
    app: &tauri::AppHandle,
    instance_id: &str,
) -> Result<Vec<String>, String> {
    let report = validate_instance_safety(app, instance_id)?;
    let inst_dir = crate::instances::get_instance_dir(app, instance_id)?;
    let inst_file = inst_dir.join("instance.json");
    let inst_data = std::fs::read_to_string(&inst_file)
        .map_err(|e| format!("Failed to read instance.json: {}", e))?;
    let instance: Instance = serde_json::from_str(&inst_data)
        .map_err(|e| format!("Failed to parse instance.json: {}", e))?;

    let loader = instance.loader.as_deref().unwrap_or("fabric");
    let mut resolved = Vec::new();

    // 1. Resolve incompatible Java runtime if flagged
    if !report.is_java_compatible {
        let req_java = report.required_java_version;
        if let Ok(installed_java) = crate::downloader::install_adoptium_runtime(app, req_java).await {
            let mut updated_instance = instance.clone();
            updated_instance.custom_java_path = Some(installed_java.path);
            let _ = crate::instances::update_instance(app, updated_instance);
            resolved.push(format!("Java {}", req_java));
        }
    }

    // 2. Resolve missing mod dependencies
    for issue in report.issues {
        if issue.issue_type != "missing_dependency" || !issue.auto_resolvable {
            continue;
        }

        let target_slug = issue.target_id.to_lowercase();

        // Skip internal submodules and system libraries that cannot be downloaded standalone
        if target_slug.starts_with("fabric-")
            || target_slug.starts_with("fabric_")
            || target_slug.starts_with("quilt_")
            || target_slug.starts_with("qsl_")
            || target_slug.contains("base")
            || target_slug.contains("api")
            || is_system_dependency(&target_slug)
        {
            continue;
        }

        // Search Modrinth with a 6-second timeout per mod
        let query_future = get_project_versions("modrinth", &target_slug, Some(&instance.mc_version), Some(loader));
        if let Ok(Ok(versions)) = tokio::time::timeout(std::time::Duration::from_secs(6), query_future).await {
            if let Some(best_ver) = versions.iter().find(|v| v.version_type.eq_ignore_ascii_case("release")).or_else(|| versions.first()) {
                if let Ok(_) = install_project_with_dependencies(
                    app,
                    instance_id,
                    "mods",
                    &best_ver.download_url,
                    &best_ver.file_name,
                    Some("modrinth"),
                    Some(&target_slug),
                    Some(&best_ver.id),
                    Some(&best_ver.name),
                    None,
                ).await {
                    resolved.push(best_ver.file_name.clone());
                }
            }
        }
    }

    if !resolved.is_empty() {
        if let Ok(mut guard) = SAFETY_CACHE.lock() {
            if let Some(ref mut cache) = *guard {
                cache.remove(instance_id);
            }
        }
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fabric_dependency_structure() {
        let raw_json = r#"{
            "schemaVersion": 1,
            "id": "testmod",
            "name": "Test Mod",
            "depends": {
                "fabricloader": ">=0.16.0",
                "minecraft": "26.2",
                "ukulib": ">=2.1.0",
                "fabric-api": "*"
            },
            "breaks": {
                "vulkanmod": "*"
            }
        }"#;

        let parsed = parse_json_lenient::<FabricModMeta>(raw_json);
        assert!(parsed.is_some());
        let meta = parsed.unwrap();
        assert_eq!(meta.name.as_deref(), Some("Test Mod"));
        assert!(meta.depends.as_ref().unwrap().contains_key("ukulib"));
        assert!(meta.breaks.as_ref().unwrap().contains_key("vulkanmod"));
    }

    #[test]
    fn correctly_identifies_system_dependencies() {
        assert!(is_system_dependency("minecraft"));
        assert!(is_system_dependency("java"));
        assert!(is_system_dependency("fabricloader"));
        assert!(!is_system_dependency("ukulib"));
        assert!(!is_system_dependency("puzzleslib"));
    }
}
