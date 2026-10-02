export type DownloadPhase = "java" | "client" | "libraries" | "assets";

export type DownloadItem = {
  id: string;
  title: string;
  phase: DownloadPhase | string;
  phaseLabel: string;
  downloadedBytes: number;
  totalBytes?: number | null;
  speedBytesPerSec: number;
  progress: number; // 0.0 to 100.0
  status: "downloading" | "extracting" | "completed" | "failed";
  error?: string | null;
  order?: number;
};
