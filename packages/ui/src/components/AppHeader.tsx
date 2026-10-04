import { PlayerHeadView } from "@sera/player-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import type { Appearance } from "../settings";
import type { Theme } from "../theme";
import { snappy } from "../motion";
import type { DownloadHistoryItem, DownloadItem } from "../downloads";
import { getBlockIconSrc, getPastelGradientForInstance, parseInstanceIcon } from "../blocks";

function formatDownloadSize(downloaded: number, total?: number | null): string {
  const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
  if (!total || total <= 0) {
    return `${dlMB} MB`;
  }
  const totMB = (total / (1024 * 1024)).toFixed(1);
  return `${dlMB} MB / ${totMB} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 KB/s";
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function formatEta(item: DownloadItem): string {
  if (item.status === "paused") return "Paused";
  if (item.status === "completed") return "Completed";
  if (item.status === "extracting") return "Extracting...";
  if (item.status === "failed") return "Failed";
  if (item.status === "stopped") return "Cancelled";

  if (item.status === "downloading") {
    if (!item.totalBytes || item.totalBytes <= item.downloadedBytes) {
      if (item.progress >= 99) return "< 5s remaining";
      return "Finalizing...";
    }
    if (!item.speedBytesPerSec || item.speedBytesPerSec <= 0) {
      return "Calculating...";
    }
    const remainingBytes = item.totalBytes - item.downloadedBytes;
    const secondsLeft = Math.ceil(remainingBytes / item.speedBytesPerSec);
    if (secondsLeft <= 5) return "< 5s remaining";
    if (secondsLeft < 60) return `${secondsLeft}s remaining`;
    if (secondsLeft < 3600) {
      const mins = Math.floor(secondsLeft / 60);
      const secs = secondsLeft % 60;
      return `${mins}m ${secs}s remaining`;
    }
    const hours = Math.floor(secondsLeft / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    return `${hours}h ${mins}m remaining`;
  }
  return "";
}

export type Account = {
  username: string;
  uuid?: string;
  avatarUrl?: string;
  skinUrl?: string;
};

export type RunningTaskInstance = {
  id: string;
  name: string;
  mcVersion?: string;
  startedAt?: number;
};

export { PlayerHeadView, MinecraftHead } from "@sera/player-model";

export function AppHeader({
  theme,
  appearance,
  onToggleTheme,
  account = null,
  runningInstances = [],
  downloads = [],
  onKillInstance,
  onAccountClick,
  downloadHistory = [],
  onPauseDownload,
  onResumeDownload,
  onStopDownload,
  onDeleteHistoryItem,
  onClearAllHistory,
}: {
  theme: Theme;
  appearance: Appearance;
  onToggleTheme: () => void;
  account?: Account | null;
  runningInstances?: RunningTaskInstance[];
  downloads?: DownloadItem[];
  downloadHistory?: DownloadHistoryItem[];
  onKillInstance?: (id: string) => void;
  onAccountClick?: () => void;
  onPauseDownload?: (id: string) => void;
  onResumeDownload?: (id: string) => void;
  onStopDownload?: (id: string) => void;
  onDeleteHistoryItem?: (id: string) => void;
  onClearAllHistory?: () => void;
}) {
  const [showDownloads, setShowDownloads] = useState(false);
  const [showComplete, setShowComplete] = useState(true);
  const downloadsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDownloads) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!downloadsRef.current?.contains(e.target as Node)) {
        setShowDownloads(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDownloads]);

  useEffect(() => {
    if (!showDownloads) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDownloads(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showDownloads]);

  const sortedDownloads = useMemo(() => {
    // oxlint-disable-next-line unicorn/no-array-sort
    return [...downloads].sort(
      (a: DownloadItem, b: DownloadItem) => (a.order ?? 0) - (b.order ?? 0),
    );
  }, [downloads]);

  const activeDownloads = sortedDownloads.filter(
    (d: DownloadItem) =>
      d.status === "downloading" || d.status === "paused" || d.status === "extracting",
  );
  const isDownloading = activeDownloads.some(
    (d: DownloadItem) => d.status === "downloading" || d.status === "extracting",
  );
  const isAnyActive = activeDownloads.length > 0;

  const totalSpeed = activeDownloads.reduce(
    (sum: number, d: DownloadItem) => sum + (d.status === "downloading" ? d.speedBytesPerSec : 0),
    0,
  );

  const downloadButtonLabel = (() => {
    if (!isAnyActive) {
      if (sortedDownloads.some((d: DownloadItem) => d.status === "completed")) {
        return "Downloads (Done)";
      }
      return "Downloads";
    }
    if (activeDownloads.length === 1) {
      const active = activeDownloads[0];
      if (active.status === "paused") {
        return `${active.phase === "java" ? "Downloading Java" : "Downloading Assets"} • Paused`;
      }
      const speedStr = formatSpeed(active.speedBytesPerSec);
      if (active.phase === "java") {
        return `Downloading Java • ${speedStr}`;
      }
      if (active.phase === "assets") {
        return `Downloading Assets • ${speedStr}`;
      }
      return `${active.title} • ${speedStr}`;
    }
    const allPaused = activeDownloads.every((d: DownloadItem) => d.status === "paused");
    if (allPaused) {
      return `Downloading (${activeDownloads.length} tasks • Paused)`;
    }
    const speedStr = formatSpeed(totalSpeed);
    return `Downloading (${activeDownloads.length} tasks • ${speedStr})`;
  })();

  const overallProgress = (() => {
    if (!isAnyActive) return 100;
    if (activeDownloads.length === 1) return activeDownloads[0].progress;
    return (
      activeDownloads.reduce((sum: number, d: DownloadItem) => sum + d.progress, 0) /
      activeDownloads.length
    );
  })();
  const [showTasks, setShowTasks] = useState(false);
  const tasksRef = useRef<HTMLDivElement>(null);

  // Close tasks dropdown on outside click
  useEffect(() => {
    if (!showTasks) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!tasksRef.current?.contains(e.target as Node)) {
        setShowTasks(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showTasks]);

  // Close tasks dropdown on Escape
  useEffect(() => {
    if (!showTasks) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTasks(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showTasks]);

  const hasAccount = Boolean(account && account.username);
  const displayName = hasAccount ? account!.username : "No Account";

  const runningCount = runningInstances.length;
  const runningText =
    runningCount === 0
      ? "No instance running"
      : runningCount === 1
        ? "1 instance running"
        : `${runningCount} instances running`;

  return (
    <header
      className="h-9 flex items-center justify-between px-5 border-0 outline-none shrink-0 z-20 bg-sidebar"
      style={{ background: theme.sidebar }}
    >
      {/* left slot for running task indicator and instance dropdown */}
      <div className="flex items-center gap-3" />
      <div className="flex items-center gap-2">
        {/* Download Manager indicator on the left of instance info */}
        <div className="relative flex items-center" ref={downloadsRef}>
          <button
            type="button"
            className={`relative inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border text-xs font-medium cursor-pointer transition-colors duration-120 overflow-hidden ${!isAnyActive ? "w-6 px-0 justify-center" : ""}`}
            style={{
              background: theme.background,
              color: isDownloading ? theme.foreground : theme.mutedForeground,
            }}
            onClick={() => setShowDownloads((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={showDownloads}
            title={
              isAnyActive
                ? (activeDownloads[0]?.phaseLabel ?? "Downloading...")
                : sortedDownloads.some((d: DownloadItem) => d.status === "completed")
                  ? "Downloads (Done)"
                  : "Downloads"
            }
          >
            <Icon
              name="download"
              size={13}
              color={isDownloading ? theme.primary : theme.mutedForeground}
            />
            {isAnyActive && (
              <span className="truncate max-w-[170px] text-[0.75rem] font-semibold leading-none">
                {downloadButtonLabel}
              </span>
            )}

            {/* Live progress line along the bottom of the button/icon */}
            {isDownloading && (
              <div
                className="absolute bottom-0 left-0 h-[2px] rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(4, Math.min(100, overallProgress))}%`,
                  background: theme.primary,
                }}
              />
            )}
          </button>

          <AnimatePresence>
            {showDownloads && (
              <motion.div
                key="download-popover"
                className="absolute right-0 top-[calc(100%+8px)] w-[320px] rounded-xl border border-border shadow-[0_16px_36px_rgba(0,0,0,0.35)] z-50 overflow-hidden"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={snappy}
                style={{
                  background: theme.card,
                  borderColor: theme.border,
                }}
              >
                <div
                  className="flex items-center justify-between px-3.5 py-2.5 border-b border-border text-xs font-semibold"
                  style={{ borderColor: theme.border }}
                >
                  <span className="text-xs font-semibold">Downloads</span>
                  {activeDownloads.length > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        color: theme.success,
                      }}
                    >
                      {activeDownloads.length} active
                    </span>
                  )}
                </div>

                {/* Active Downloads Section (if any active) */}
                {activeDownloads.length > 0 && (
                  <div className="p-2 flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                    <div className="flex flex-col gap-1.5">
                      {activeDownloads.map((item: DownloadItem) => {
                        const sizeLabel = formatDownloadSize(item.downloadedBytes, item.totalBytes);
                        const etaLabel = formatEta(item);

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col gap-1.5 p-2 rounded-lg border border-border/50"
                            style={{
                              background: theme.secondary,
                              borderColor: theme.border,
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-col min-w-0">
                                <span
                                  className="text-xs font-medium truncate leading-tight"
                                  style={{ color: theme.foreground }}
                                >
                                  {item.title}
                                </span>
                                <span
                                  className="text-[11px] truncate leading-tight"
                                  style={{ color: theme.mutedForeground }}
                                >
                                  {item.phaseLabel}
                                </span>
                              </div>

                              {/* Action buttons (Pause/Resume & Cancel) */}
                              <div className="flex items-center gap-1 shrink-0">
                                {(item.status === "downloading" || item.status === "paused") && (
                                  <>
                                    {item.status === "downloading" ? (
                                      <button
                                        type="button"
                                        className="size-5 flex items-center justify-center rounded cursor-pointer transition-colors"
                                        onClick={() => onPauseDownload?.(item.id)}
                                        title="Pause download"
                                        style={{
                                          color: theme.foreground,
                                          background: theme.border,
                                        }}
                                      >
                                        <Icon name="pause" size={12} color={theme.foreground} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="size-5 flex items-center justify-center rounded cursor-pointer transition-colors"
                                        onClick={() => onResumeDownload?.(item.id)}
                                        title="Resume download"
                                        style={{
                                          color: theme.foreground,
                                          background: theme.border,
                                        }}
                                      >
                                        <Icon name="play" size={12} color={theme.foreground} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="size-5 flex items-center justify-center rounded cursor-pointer transition-colors"
                                      onClick={() => onStopDownload?.(item.id)}
                                      title="Cancel download"
                                      style={{
                                        color: theme.foreground,
                                        background: theme.border,
                                      }}
                                    >
                                      <Icon name="x" size={12} color={theme.foreground} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div
                              className="h-1.5 w-full rounded-full overflow-hidden"
                              style={{ background: theme.card }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-200"
                                style={{
                                  width: `${Math.min(100, Math.max(0, item.progress))}%`,
                                  background:
                                    item.status === "failed"
                                      ? theme.destructive
                                      : item.status === "completed"
                                        ? theme.success
                                        : item.status === "paused"
                                          ? "rgba(245, 158, 11, 0.9)"
                                          : theme.primary,
                                }}
                              />
                            </div>

                            {/* Bottom row: Megabyte calculation under progress bar on left, ETA on right */}
                            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                              <span
                                className="text-[10px] font-medium font-mono tabular-nums"
                                style={{ color: theme.mutedForeground }}
                              >
                                {sizeLabel}
                              </span>
                              <span
                                className="text-[10px] font-medium font-mono tabular-nums"
                                style={{
                                  color:
                                    item.status === "paused"
                                      ? "rgba(245, 158, 11, 1)"
                                      : item.status === "completed"
                                        ? theme.success
                                        : item.status === "failed"
                                          ? theme.destructive
                                          : theme.mutedForeground,
                                }}
                              >
                                {etaLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Download History Section ("Complete") */}
                <div className="border-t border-border">
                  <div className="flex items-center justify-between px-3.5 py-2 text-[11px]">
                    <button
                      type="button"
                      className="flex items-center gap-1 font-medium cursor-pointer transition-colors"
                      onClick={() => setShowComplete((prev) => !prev)}
                      style={{ color: theme.foreground }}
                    >
                      <motion.span
                        animate={{ rotate: showComplete ? 0 : -90 }}
                        transition={snappy}
                        style={{ display: "inline-flex" }}
                      >
                        <Icon name="chevronDown" size={13} color={theme.mutedForeground} />
                      </motion.span>
                      <span>Complete</span>
                    </button>

                    {downloadHistory.length > 0 && (
                      <button
                        type="button"
                        className="text-[10px] cursor-pointer transition-colors hover:text-destructive"
                        onClick={onClearAllHistory}
                        style={{ color: theme.mutedForeground }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {showComplete && (
                      <motion.div
                        key="complete-history-list"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={snappy}
                        className="flex flex-col max-h-[160px] overflow-y-auto"
                      >
                        {downloadHistory.length === 0 ? (
                          <div
                            className="p-4 text-center text-xs"
                            style={{ color: theme.mutedForeground }}
                          >
                            No download history
                          </div>
                        ) : (
                          downloadHistory.map((item) => {
                            const { blockKey } = parseInstanceIcon(
                              item.instanceIcon,
                              item.instanceName,
                            );
                            const gradient = getPastelGradientForInstance(
                              item.instanceName,
                              item.instanceIcon,
                            );
                            const iconSrc = getBlockIconSrc(blockKey);
                            const statusLabel =
                              item.status === "completed"
                                ? "New instance"
                                : item.status === "canceled"
                                  ? "Canceled"
                                  : "Failed";

                            return (
                              <div
                                key={item.id}
                                className="group flex items-center justify-between px-3.5 py-1.5 hover:bg-secondary/30 transition-colors text-xs"
                              >
                                <div
                                  className="size-6 rounded-md flex items-center justify-center shrink-0"
                                  style={{
                                    background: `linear-gradient(135deg, ${gradient.top}, ${gradient.bottom})`,
                                  }}
                                >
                                  <img src={iconSrc} alt="" className="size-5 object-contain" />
                                </div>

                                <div className="flex flex-col min-w-0 flex-1 ml-2">
                                  <span
                                    className="truncate text-xs font-medium"
                                    style={{ color: theme.foreground }}
                                  >
                                    {item.instanceName}
                                  </span>
                                  <div
                                    className="text-[10px] font-mono flex items-center"
                                    style={{ color: theme.mutedForeground }}
                                  >
                                    <span>{formatTimeAgo(item.timestamp)}</span>
                                    <span className="mx-1 opacity-60">•</span>
                                    <span>{statusLabel}</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 hover:text-destructive cursor-pointer transition-opacity p-0.5 rounded"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteHistoryItem?.(item.id);
                                  }}
                                  title="Remove from history"
                                  aria-label={`Remove ${item.instanceName} from history`}
                                >
                                  <Icon name="trash" size={14} color={theme.mutedForeground} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {(!isAnyActive || runningCount > 0) && (
          <div className="relative flex items-center" ref={tasksRef}>
            <button
              type="button"
              className="inline-flex items-center gap-2 h-6 px-2.5 rounded-full border border-border text-xs font-medium cursor-pointer transition-colors duration-120"
              style={{
                background: theme.background,
                color: runningCount > 0 ? theme.foreground : theme.mutedForeground,
              }}
              onClick={() => setShowTasks((prev) => !prev)}
              aria-haspopup="dialog"
              aria-expanded={showTasks}
            >
              <div className="relative flex items-center justify-center size-2">
                {runningCount > 0 && (
                  <span
                    className="absolute -inset-0.5 rounded-full animate-header-task-pulse"
                    style={{ background: theme.success }}
                  />
                )}
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: runningCount > 0 ? theme.success : theme.mutedForeground,
                    opacity: runningCount > 0 ? 1 : 0.45,
                  }}
                />
              </div>
              <span className="text-[0.75rem] font-semibold leading-none">{runningText}</span>
              <motion.span
                className="inline-flex items-center justify-center shrink-0"
                animate={{ rotate: showTasks ? 180 : 0 }}
                transition={snappy}
              >
                <Icon name="chevronDown" size={13} color={theme.mutedForeground} />
              </motion.span>
            </button>

            <AnimatePresence>
              {showTasks && (
                <motion.div
                  key="task-popover"
                  className="absolute right-0 top-[calc(100%+8px)] w-[260px] rounded-xl border border-border shadow-[0_16px_36px_rgba(0,0,0,0.35)] z-50 overflow-hidden"
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={snappy}
                  style={{
                    background: theme.card,
                    borderColor: theme.border,
                  }}
                >
                  <div
                    className="flex items-center justify-between px-3.5 py-2.5 border-b border-border text-xs font-semibold"
                    style={{ borderColor: theme.border }}
                  >
                    <span className="text-xs font-semibold">Running Tasks</span>
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                      style={{
                        background: runningCount > 0 ? theme.success : theme.secondary,
                        color: runningCount > 0 ? "#ffffff" : theme.mutedForeground,
                      }}
                    >
                      {runningCount}
                    </span>
                  </div>

                  {runningCount === 0 ? (
                    <div
                      className="flex items-center justify-center p-4 text-xs"
                      style={{ color: theme.mutedForeground }}
                    >
                      No instance running
                    </div>
                  ) : (
                    <div className="flex flex-col p-1.5 max-h-[220px] overflow-y-auto gap-1">
                      {runningInstances.map((inst) => (
                        <div
                          key={inst.id}
                          className="flex items-center justify-between p-2 rounded-lg transition-colors"
                          style={{ background: theme.secondary }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ background: theme.success }}
                            />
                            <div className="flex flex-col min-w-0">
                              <span
                                className="text-xs font-medium truncate leading-tight"
                                style={{ color: theme.foreground }}
                              >
                                {inst.name}
                              </span>
                              {inst.mcVersion && (
                                <span
                                  className="text-[10px] leading-tight"
                                  style={{ color: theme.mutedForeground }}
                                >
                                  {inst.mcVersion}
                                </span>
                              )}
                            </div>
                          </div>
                          {onKillInstance && (
                            <button
                              type="button"
                              className="size-5 flex items-center justify-center rounded cursor-pointer transition-colors shrink-0"
                              title="Stop instance"
                              aria-label={`Stop ${inst.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onKillInstance(inst.id);
                              }}
                            >
                              <Icon name="x" size={13} color={theme.mutedForeground} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <button
          type="button"
          className="inline-flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer select-none transition-opacity duration-120 hover:opacity-85"
          onClick={onAccountClick}
          title={hasAccount ? `Logged in as ${account?.username}` : "Sign in with Microsoft"}
          style={{ color: hasAccount ? theme.sidebarForeground : theme.mutedForeground }}
        >
          <PlayerHeadView
            username={account?.username}
            skinUrl={account?.skinUrl}
            avatarUrl={account?.avatarUrl}
            size={22}
            viewMode="3d"
            facing="right"
            isGray={!hasAccount}
          />
          <span className="text-[0.84rem] font-semibold leading-none">{displayName}</span>
        </button>

        {/* theme toggle placed directly to the right of the account info */}
        <motion.button
          type="button"
          className="inline-flex items-center justify-center size-6 p-0 border-0 bg-transparent cursor-pointer transition-colors duration-120 hover:opacity-85"
          style={{ color: theme.mutedForeground }}
          whileTap={{ scale: 0.9 }}
          transition={snappy}
          onClick={onToggleTheme}
          title={appearance === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={appearance === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon name={appearance === "dark" ? "sun" : "moon"} size={16} color="currentColor" />
        </motion.button>
      </div>
    </header>
  );
}
