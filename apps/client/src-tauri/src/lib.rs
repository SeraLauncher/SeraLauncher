use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

mod fonts;
mod java;

const DEFAULT_APPEARANCE: &str = "dark";
const BUNDLED_FAMILY: &str = "Sunghyun Sans";
const DEFAULT_FONT_SIZE: u32 = 16;
const MIN_FONT_SIZE: u32 = 12;
const MAX_FONT_SIZE: u32 = 20;

const DEFAULT_MIN_MEMORY: u32 = 2048;
const DEFAULT_MAX_MEMORY: u32 = 4096;
const DEFAULT_GC_PRESET: &str = "g1gc";
const DEFAULT_JAVA_OPTIMIZE: bool = true;
const DEFAULT_JVM_ARGS: &str = "";

/// User preferences, persisted as json in the platform config dir. Unreadable or
/// malformed data falls back to defaults rather than stopping the app.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default = "Settings::defaults", rename_all = "camelCase")]
pub struct Settings {
    pub appearance: String,
    pub font: String,
    pub font_size: u32,
    pub java_path: Option<String>,
    pub min_memory: u32,
    pub max_memory: u32,
    pub gc_preset: String,
    pub java_optimize: bool,
    pub jvm_args: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self::defaults()
    }
}

impl Settings {
    /// Real values, not empty strings: a bare `{}` on disk must not deserialize into
    /// an appearance the ui cannot look up.
    fn defaults() -> Self {
        Self {
            appearance: DEFAULT_APPEARANCE.into(),
            font: BUNDLED_FAMILY.into(),
            font_size: DEFAULT_FONT_SIZE,
            java_path: None,
            min_memory: DEFAULT_MIN_MEMORY,
            max_memory: DEFAULT_MAX_MEMORY,
            gc_preset: DEFAULT_GC_PRESET.into(),
            java_optimize: DEFAULT_JAVA_OPTIMIZE,
            jvm_args: DEFAULT_JVM_ARGS.into(),
        }
    }

    /// Discards anything the ui would not recognise, so a hand-edited or older file
    /// can never leave the app unable to pick a palette.
    fn sanitized(mut self) -> Self {
        if !matches!(self.appearance.as_str(), "dark" | "light") {
            self.appearance = DEFAULT_APPEARANCE.into();
        }
        if self.font.trim().is_empty() {
            self.font = BUNDLED_FAMILY.into();
        }
        self.font_size = self.font_size.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE);

        self.java_path = self.java_path.and_then(|p| {
            let t = p.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        });

        // minimum RAM at least 512 MB, maximum RAM up to 64 GB
        self.min_memory = self.min_memory.clamp(512, 65536);
        self.max_memory = self.max_memory.clamp(self.min_memory, 65536);

        if !matches!(self.gc_preset.to_lowercase().as_str(), "none" | "g1gc" | "zgc") {
            self.gc_preset = DEFAULT_GC_PRESET.into();
        }

        self
    }

    fn read(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|err| {
                eprintln!("sera: ignoring settings at {}: {err}", path.display());
                Settings::default()
            }),
            // first run, nothing to report
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(err) => {
                eprintln!("sera: could not read settings at {}: {err}", path.display());
                Settings::default()
            }
        }
    }

    fn write(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        std::fs::write(path, serde_json::to_vec_pretty(self).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())
    }
}

/// Where settings live, e.g. `~/.config/SeraLauncher/settings.json`.
fn settings_path(base: &Path) -> PathBuf {
    base.join("SeraLauncher").join("settings.json")
}

/// Per-user config base for the platform. `app_config_dir` nests under the bundle
/// identifier (`~/.config/com.yoruakio.sera-launcher`); its parent is the plain
/// per-user base, so the app keeps a readable name on every platform.
fn config_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let scoped = app.path().app_config_dir().map_err(|err| err.to_string())?;
    Ok(scoped.parent().unwrap_or(&scoped).to_path_buf())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(&config_root(&app)?);
    Ok(Settings::read(&path).sanitized())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    settings.write(&settings_path(&config_root(&app)?))
}

/// Families the user can pick from, with the bundled face first so it stays the
/// default no matter what the machine happens to have installed.
#[tauri::command]
fn list_fonts() -> Vec<String> {
    let installed = fonts::installed();
    let mut families = vec![BUNDLED_FAMILY.to_string()];
    families.extend(installed.into_iter().filter(|name| name != BUNDLED_FAMILY));
    families
}

/// Lists all detected Java runtimes across the system, newest first.
#[tauri::command]
fn list_java_runtimes() -> Vec<java::JavaRuntime> {
    java::discover_java_runtimes()
}

/// Returns the host system's total physical memory in megabytes (MB).
#[tauri::command]
fn get_system_memory() -> u32 {
    java::system_total_memory_mb()
}

/// Validates a custom Java executable path by testing `-version`.
#[tauri::command]
fn validate_java_path(path: String) -> Result<java::JavaRuntime, String> {
    let p = Path::new(&path);
    java::inspect_java_binary(p).ok_or_else(|| format!("Invalid Java executable at {}", path))
}

/// Returns the required Java major version for a given Minecraft version string.
#[tauri::command]
fn get_required_java_version(mc_version: String) -> u32 {
    java::required_java_version(&mc_version)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsEntry {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub url: String,
    pub image: String,
    pub image_alt_text: Option<String>,
    pub author: Option<String>,
    pub time: Option<i64>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub category: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSearchResult {
    #[serde(default)]
    results: Vec<NewsEntry>,
    #[serde(default)]
    num_found: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawNewsResponse {
    result: Option<RawSearchResult>,
    #[serde(default)]
    entries: Option<Vec<NewsEntry>>,
    #[serde(default)]
    total: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsResponse {
    pub entries: Vec<NewsEntry>,
    pub total: Option<u32>,
}

/// fetches java news from mojang services; proxied through rust because the endpoint
/// does not emit permissive cors headers for webview origins
#[tauri::command]
async fn fetch_minecraft_news(page_size: Option<u32>) -> Result<NewsResponse, String> {
    let size = page_size.unwrap_or(4).clamp(1, 50);
    let url = format!(
        "https://net-secondary.web.minecraft-services.net/api/v1.0/en-us/search?pageSize={size}&sortType=Recent&category=News&newsOnly=true&filter%5Bsubscription%5D=Minecraft%3A+Java"
    );

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header("content-type", "application/json")
        .header("dnt", "1")
        .header("origin", "https://www.minecraft.net")
        .header("referer", "https://www.minecraft.net/")
        .header(
            "sec-ch-ua",
            "\"Not=A?Brand\";v=\"99\", \"Google Chrome\";v=\"151\", \"Chromium\";v=\"151\"",
        )
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Linux\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "cross-site")
        .header(
            "user-agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !res.status().is_success() {
        return Err(format!("minecraft services responded with {}", res.status()));
    }

    let parsed: RawNewsResponse = res.json().await.map_err(|err| err.to_string())?;
    let (entries, total) = if let Some(result) = parsed.result {
        (result.results, result.num_found)
    } else {
        (parsed.entries.unwrap_or_default(), parsed.total)
    };

    Ok(NewsResponse { entries, total })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            list_fonts,
            fetch_minecraft_news,
            list_java_runtimes,
            get_system_memory,
            validate_java_path,
            get_required_java_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique per test, cargo runs them in parallel threads sharing one pid.
    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("sera-settings-{}-{name}", std::process::id()))
    }

    #[test]
    fn roundtrips_through_a_file() {
        let path = scratch("roundtrip").join("SeraLauncher").join("settings.json");
        let saved = Settings {
            appearance: "light".into(),
            font: "Inter".into(),
            font_size: 18,
            java_path: Some("/usr/bin/java".into()),
            min_memory: 1024,
            max_memory: 8192,
            gc_preset: "zgc".into(),
            java_optimize: false,
            jvm_args: "-Dsun.misc.URLClassPath.disableJarChecking=true".into(),
        };

        saved.write(&path).unwrap();

        assert_eq!(Settings::read(&path), saved);
        std::fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).ok();
    }

    #[test]
    fn a_missing_or_broken_file_falls_back_to_defaults() {
        let dir = scratch("broken");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();

        assert_eq!(Settings::read(&path), Settings::default());

        std::fs::write(&path, "{ not json").unwrap();

        assert_eq!(Settings::read(&path), Settings::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_empty_object_loads_usable_values() {
        let dir = scratch("empty");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "{}").unwrap();

        let loaded = Settings::read(&path);

        assert_eq!(loaded, Settings::defaults());
        assert!(matches!(loaded.appearance.as_str(), "dark" | "light"));
        assert_eq!(loaded.min_memory, DEFAULT_MIN_MEMORY);
        assert_eq!(loaded.max_memory, DEFAULT_MAX_MEMORY);
        assert_eq!(loaded.gc_preset, DEFAULT_GC_PRESET);
        assert_eq!(loaded.java_optimize, DEFAULT_JAVA_OPTIMIZE);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_unknown_appearance_falls_back_to_dark() {
        let dir = scratch("unknown");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{ "appearance": "neon", "font": "Inter" }"#).unwrap();

        let loaded = Settings::read(&path).sanitized();

        assert_eq!(loaded.appearance, DEFAULT_APPEARANCE);
        assert_eq!(loaded.font, "Inter");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_wild_font_size_is_clamped() {
        let dir = scratch("size");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{ "fontSize": 900 }"#).unwrap();

        assert_eq!(Settings::read(&path).sanitized().font_size, MAX_FONT_SIZE);
        std::fs::remove_dir_all(&dir).ok();
    }


    #[test]
    fn an_unknown_gc_preset_falls_back_to_g1gc() {
        let dir = scratch("gc");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{ "gcPreset": "shenandoah" }"#).unwrap();

        let loaded = Settings::read(&path).sanitized();
        assert_eq!(loaded.gc_preset, DEFAULT_GC_PRESET);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ram_allocation_is_clamped() {
        let dir = scratch("ram");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{ "minMemory": 128, "maxMemory": 256 }"#).unwrap();

        let sanitized = Settings::read(&path).sanitized();
        assert_eq!(sanitized.min_memory, 512);
        assert_eq!(sanitized.max_memory, 512);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_config_dir_is_named_after_the_app() {
        let base = Path::new("/home/someone/.config");

        assert_eq!(
            settings_path(base),
            Path::new("/home/someone/.config/SeraLauncher/settings.json")
        );
    }
}
