export type DownloadPhase = "java" | "client" | "libraries" | "assets";

export type DownloadStatus =
  | "downloading"
  | "paused"
  | "stopped"
  | "extracting"
  | "completed"
  | "failed";

export type DownloadItem = {
  id: string;
  title: string;
  phase: DownloadPhase | string;
  phaseLabel: string;
  downloadedBytes: number;
  totalBytes?: number | null;
  speedBytesPerSec: number;
  progress: number; // 0.0 to 100.0
  status: DownloadStatus;
  error?: string | null;
  order?: number;
  instanceName?: string | null;
  instanceIcon?: string | null;
};

export type DownloadHistoryStatus = "completed" | "canceled" | "failed";

export type DownloadItemCategory =
  | "instance"
  | "mod"
  | "modpack"
  | "resourcepack"
  | "shader"
  | "loader"
  | string;

export type DownloadHistoryItem = {
  id: string;
  title?: string;
  instanceName: string;
  instanceIcon?: string | null;
  mcVersion?: string;
  status: DownloadHistoryStatus;
  timestamp: number; // Unix epoch ms
  type?: DownloadItemCategory;
  iconUrl?: string | null;
};

export const DOWNLOAD_HISTORY_STORAGE_KEY = "sera_download_history";

export type RecordDownloadHistoryInput = Omit<DownloadHistoryItem, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

export function recordDownloadHistory(input: RecordDownloadHistoryInput) {
  try {
    const item: DownloadHistoryItem = {
      ...input,
      id: input.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: input.timestamp || Date.now(),
    };
    const saved = localStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
    const prev: DownloadHistoryItem[] = saved ? JSON.parse(saved) : [];
    const updated = [item, ...prev.filter((i) => i.id !== item.id)].slice(0, 60);
    localStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("sera_download_history_changed"));
  } catch {
    // ignore
  }
}
