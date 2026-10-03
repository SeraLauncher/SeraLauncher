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

export type DownloadHistoryItem = {
  id: string;
  instanceName: string;
  instanceIcon?: string | null;
  mcVersion?: string;
  status: DownloadHistoryStatus;
  timestamp: number; // Unix epoch ms
};
