use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
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
    pub status: String,      // "downloading" | "paused" | "stopped" | "extracting" | "completed" | "failed"
    pub error: Option<String>,
    pub order: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_icon: Option<String>,
}

#[derive(Default)]
pub struct DownloadController {
    pub paused: AtomicBool,
    pub stopped: AtomicBool,
}

static ORDER_COUNTER: AtomicU64 = AtomicU64::new(1);
static ACTIVE_DOWNLOADS: Mutex<Option<Vec<DownloadItem>>> = Mutex::new(None);
static CONTROLLERS: Mutex<Option<HashMap<String, Arc<DownloadController>>>> = Mutex::new(None);

pub fn get_or_create_controller(id: &str) -> Arc<DownloadController> {
    let mut guard = CONTROLLERS.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    map.entry(id.to_string())
        .or_insert_with(|| Arc::new(DownloadController::default()))
        .clone()
}

pub fn is_download_paused(id: &str) -> bool {
    if let Ok(guard) = CONTROLLERS.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(c) = map.get(id) {
                return c.paused.load(Ordering::Relaxed);
            }
        }
    }
    false
}

pub fn is_download_stopped(id: &str) -> bool {
    if let Ok(guard) = CONTROLLERS.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(c) = map.get(id) {
                return c.stopped.load(Ordering::Relaxed);
            }
        }
    }
    false
}

pub fn pause_download(app: &tauri::AppHandle, id: &str) {
    let ctrl = get_or_create_controller(id);
    ctrl.paused.store(true, Ordering::Relaxed);

    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        if let Some(list) = guard.as_mut() {
            if let Some(item) = list.iter_mut().find(|d| d.id == id) {
                item.status = "paused".to_string();
                item.speed_bytes_per_sec = 0;
            }
            let snapshot = list.clone();
            let _ = app.emit("downloads_changed", snapshot);
        }
    }
}

pub fn resume_download(app: &tauri::AppHandle, id: &str) {
    let ctrl = get_or_create_controller(id);
    ctrl.paused.store(false, Ordering::Relaxed);

    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        if let Some(list) = guard.as_mut() {
            if let Some(item) = list.iter_mut().find(|d| d.id == id) {
                item.status = "downloading".to_string();
            }
            let snapshot = list.clone();
            let _ = app.emit("downloads_changed", snapshot);
        }
    }
}

pub fn stop_download(app: &tauri::AppHandle, id: &str) {
    let ctrl = get_or_create_controller(id);
    ctrl.stopped.store(true, Ordering::Relaxed);
    ctrl.paused.store(false, Ordering::Relaxed);

    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        if let Some(list) = guard.as_mut() {
            list.retain(|d| d.id != id);
            let snapshot = list.clone();
            let _ = app.emit("downloads_changed", snapshot);
        }
    }
}

pub fn update_download_progress(app: &tauri::AppHandle, mut item: DownloadItem) {
    if is_download_stopped(&item.id) {
        return;
    }
    let paused = is_download_paused(&item.id);

    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if let Some(existing) = list.iter_mut().find(|d| d.id == item.id) {
            item.order = existing.order;
            if item.instance_name.is_none() {
                item.instance_name = existing.instance_name.clone();
            }
            if item.instance_icon.is_none() {
                item.instance_icon = existing.instance_icon.clone();
            }
            if paused {
                item.status = "paused".to_string();
                item.speed_bytes_per_sec = 0;
            }
            if existing.status == "stopped" || is_download_stopped(&item.id) {
                item.status = "stopped".to_string();
                item.speed_bytes_per_sec = 0;
            }
            // Prevent progress or downloaded_bytes from jumping backwards
            if (existing.status == "downloading" || existing.status == "paused") && (item.status == "downloading" || item.status == "paused") {
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
            if paused {
                item.status = "paused".to_string();
                item.speed_bytes_per_sec = 0;
            }
            list.push(item);
        }
        let snapshot = list.clone();
        let _ = app.emit("downloads_changed", snapshot);
    }
}

pub fn finish_download(app: &tauri::AppHandle, id: &str) {
    if let Ok(mut guard) = ACTIVE_DOWNLOADS.lock() {
        if let Some(list) = guard.as_mut() {
            list.retain(|d| d.id != id);
            let snapshot = list.clone();
            let _ = app.emit("downloads_changed", snapshot);
        }
    }
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
