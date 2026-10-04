use std::path::PathBuf;
use tauri::Manager;

/// Root data directory for SeraLauncher:
/// - Linux: `~/.local/share/SeraLauncher`
/// - macOS: `~/Library/Application Support/SeraLauncher`
/// - Windows: `%APPDATA%\SeraLauncher`
pub fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_base = app.path().data_dir().map_err(|err| err.to_string())?;
    let root = data_base.join("SeraLauncher");

    if !root.exists() {
        let _ = std::fs::create_dir_all(&root);
    }

    Ok(root)
}

/// Directory for Minecraft instances: `<app_data_root>/instance`.
pub fn instances_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("instance");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Directory for downloaded Java runtimes: `<app_data_root>/runtimes`.
pub fn runtimes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("runtimes");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Directory for shared Minecraft assets: `<app_data_root>/assets`.
pub fn assets_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("assets");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Directory for shared Minecraft libraries: `<app_data_root>/libraries`.
pub fn libraries_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("libraries");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Directory for shared Minecraft version packages: `<app_data_root>/versions`.
pub fn versions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("versions");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}

/// Path to `settings.json`: `<app_data_root>/settings.json`.
pub fn settings_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = app_data_root(app)?;
    Ok(root.join("settings.json"))
}
/// Path to `accounts.json`: `<app_data_root>/accounts.json`.
pub fn accounts_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_root(app)?.join("accounts.json"))
}

/// Directory for cached player skins: `<app_data_root>/skins`.
pub fn skins_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_root(app)?.join("skins");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir)
}
