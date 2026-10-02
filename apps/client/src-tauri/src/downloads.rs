use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub title: String,
    pub phase: String,       // "java" | "client" | "libraries" | "assets"
    pub phase_label: String, // e.g. "Downloading Java 16 Runtime", "Downloading Minecraft Assets"
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bytes_per_sec: u64,
    pub progress: f64,       // 0.0 .. 100.0
    pub status: String,      // "downloading" | "extracting" | "completed" | "failed"
    pub error: Option<String>,
    pub order: u64,
}

static ORDER_COUNTER: AtomicU64 = AtomicU64::new(1);
static ACTIVE_DOWNLOADS: Mutex<Option<Vec<DownloadItem>>> = Mutex::new(None);

pub fn update_download_progress(app: &tauri::AppHandle, mut item: DownloadItem) {
    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if let Some(existing) = list.iter_mut().find(|d| d.id == item.id) {
            item.order = existing.order;
            // Prevent progress or downloaded_bytes from jumping backwards
            if existing.status == "downloading" && item.status == "downloading" {
                if item.progress < existing.progress {
                    item.progress = existing.progress;
                }
                if item.downloaded_bytes < existing.downloaded_bytes {
                    item.downloaded_bytes = existing.downloaded_bytes;
                }
            }
            *existing = item;
        } else {
            item.order = ORDER_COUNTER.fetch_add(1, Ordering::Relaxed);
            list.push(item);
        }
        let snapshot = list.clone();
        let _ = app.emit("downloads_changed", snapshot);
    }
}

pub fn finish_download(app: &tauri::AppHandle, id: &str) {
    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if let Some(item) = list.iter_mut().find(|d| d.id == id) {
            item.status = "completed".to_string();
            item.progress = 100.0;
            item.speed_bytes_per_sec = 0;
            if item.phase == "java" {
                item.phase_label = "Java Runtime Installed".to_string();
            } else {
                item.phase_label = "Assets Downloaded".to_string();
            }
            if let Some(tot) = item.total_bytes {
                item.downloaded_bytes = tot;
            }
        }
        let snapshot = list.clone();
        let _ = app.emit("downloads_changed", snapshot);
    }

    // Keep completed downloads visible for 60 seconds so users can see full history
    let app_handle = app.clone();
    let id_str = id.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
            if let Some(list) = guard.as_mut() {
                list.retain(|d| d.id != id_str);
                let snapshot = list.clone();
                let _ = app_handle.emit("downloads_changed", snapshot);
            }
        }
    });
}

pub fn fail_download(app: &tauri::AppHandle, id: &str, error: &str) {
    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if let Some(item) = list.iter_mut().find(|d| d.id == id) {
            item.status = "failed".to_string();
            item.error = Some(error.to_string());
            item.speed_bytes_per_sec = 0;
        }
        let snapshot = list.clone();
        let _ = app.emit("downloads_changed", snapshot);
    }
}

pub fn list_downloads() -> Vec<DownloadItem> {
    if let Ok(guard) = ACTIVE_DOWNLOADS.lock() {
        guard.as_ref().cloned().unwrap_or_default()
    } else {
        Vec::new()
    }
}
