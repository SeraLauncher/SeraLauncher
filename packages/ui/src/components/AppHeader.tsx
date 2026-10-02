import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import type { Appearance } from "../settings";
import type { Theme } from "../theme";
import { snappy } from "../motion";
import steveGraySkin from "../assets/images/steve-gray-skin.png";
import type { DownloadItem } from "../downloads";

function formatDownloadSize(downloaded: number, total?: number | null): string | null {
  if (!total || total <= 0) {
    if (downloaded > 0) {
      return `${(downloaded / (1024 * 1024)).toFixed(1)} MB`;
    }
    return null;
  }
  const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
  const totMB = (total / (1024 * 1024)).toFixed(1);
  return `${dlMB} MB / ${totMB} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 KB/s";
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
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

/** Official Mojang grayscale Steve texture URL */
export const DEFAULT_STEVE_TEXTURE =
  "http://textures.minecraft.net/texture/adb0e5c6f99e66b74fa84277894b7e4b8f09b2452fb7e486d6ee42b045c26137";

/** renders real minecraft player heads from skin textures or head apis */
export function MinecraftHead({
  username,
  skinUrl,
  avatarUrl,
  size = 20,
  isGray = false,
}: {
  username?: string;
  skinUrl?: string;
  avatarUrl?: string;
  size?: number;
  isGray?: boolean;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  // default to the official grayscale steve texture when no specific skin/user is given
  const isDefaultTexture = !username && !avatarUrl && !skinUrl;
  const activeSkin = skinUrl ?? (isDefaultTexture ? steveGraySkin : undefined);

  if (activeSkin && !loadFailed) {
    // 64x64 skin texture: front face is (8,8) to (16,16), helm layer is (40,8) to (48,16)
    const faceOffset = -size;
    const helmOffset = -size * 5;
    const bgSize = size * 8;

    return (
      <div
        role="img"
        aria-label={username ?? "Minecraft Player Head"}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          backgroundImage: `url("${activeSkin}"), url("${activeSkin}")`,
          backgroundPosition: `${helmOffset}px ${faceOffset}px, ${faceOffset}px ${faceOffset}px`,
          backgroundSize: `${bgSize}px ${bgSize}px, ${bgSize}px ${bgSize}px`,
          backgroundRepeat: "no-repeat, no-repeat",
          imageRendering: "pixelated",
          filter: isGray ? "grayscale(100%)" : "none",
          display: "inline-block",
        }}
      />
    );
  }

  // player head endpoint for usernames or custom avatar URLs
  const headSrc =
    avatarUrl ?? `https://mc-heads.net/avatar/${encodeURIComponent(username ?? "Steve")}/32`;

  return (
    <img
      src={headSrc}
      alt={username ?? "Steve"}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setLoadFailed(true)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        imageRendering: "pixelated",
        filter: isGray ? "grayscale(100%)" : "none",
        display: "block",
      }}
    />
  );
}

export function AppHeader({
  theme,
  appearance,
  onToggleTheme,
  account = null,
  runningInstances = [],
  downloads = [],
  onKillInstance,
  onAccountClick,
}: {
  theme: Theme;
  appearance: Appearance;
  onToggleTheme: () => void;
  account?: Account | null;
  runningInstances?: RunningTaskInstance[];
  downloads?: DownloadItem[];
  onKillInstance?: (id: string) => void;
  onAccountClick?: () => void;
}) {
  const [showDownloads, setShowDownloads] = useState(false);
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
    (d: DownloadItem) => d.status === "downloading" || d.status === "extracting",
  );
  const isDownloading = activeDownloads.length > 0;

  const downloadButtonLabel = (() => {
    if (!isDownloading) {
      if (sortedDownloads.some((d: DownloadItem) => d.status === "completed")) {
        return "Downloads (Done)";
      }
      return "Downloads";
    }
    if (activeDownloads.length === 1) {
      const active = activeDownloads[0];
      const percent = Math.round(active.progress);
      if (active.phase === "java") {
        return `Downloading Java (${percent}%)`;
      }
      if (active.phase === "assets") {
        return `Downloading Assets (${percent}%)`;
      }
      return `${active.title} (${percent}%)`;
    }
    const avgPercent = Math.round(
      activeDownloads.reduce((sum: number, d: DownloadItem) => sum + d.progress, 0) /
        activeDownloads.length,
    );
    return `Downloading (${activeDownloads.length} tasks • ${avgPercent}%)`;
  })();

  const overallProgress = (() => {
    if (!isDownloading) return 100;
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
    <header className="app-header" style={{ background: theme.sidebar }}>
      {/* left slot for running task indicator and instance dropdown */}
      <div className="header-left" />
      <div className="header-right">
        {/* Download Manager indicator on the left of instance info */}
        <div className="header-download-wrapper" ref={downloadsRef}>
          <button
            type="button"
            className="header-download-btn"
            style={{
              background: theme.background,
              color: isDownloading ? theme.foreground : theme.mutedForeground,
            }}
            onClick={() => setShowDownloads((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={showDownloads}
            title={isDownloading ? activeDownloads[0]?.phaseLabel : "Downloads"}
          >
            <Icon
              name="download"
              size={13}
              color={isDownloading ? theme.primary : theme.mutedForeground}
            />
            <span className="header-download-btn-label">{downloadButtonLabel}</span>

            {/* Live progress line along the bottom of the button/icon */}
            {isDownloading && (
              <div
                className="header-download-pill-progress"
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
                className="header-download-popover"
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
                  className="header-download-popover-header"
                  style={{ borderColor: theme.border }}
                >
                  <span className="header-download-popover-title">Downloads</span>
                  <span
                    className="header-download-badge"
                    style={{
                      background: isDownloading ? "rgba(16, 185, 129, 0.15)" : theme.secondary,
                      color: isDownloading ? theme.success : theme.mutedForeground,
                    }}
                  >
                    {isDownloading
                      ? `${
                          downloads.filter(
                            (d) => d.status === "downloading" || d.status === "extracting",
                          ).length
                        } active`
                      : "Idle"}
                  </span>
                </div>

                <div className="header-download-popover-body">
                  {sortedDownloads.length === 0 ? (
                    <div className="header-download-empty" style={{ color: theme.mutedForeground }}>
                      <Icon name="download" size={20} color={theme.mutedForeground} />
                      <span>No active downloads</span>
                    </div>
                  ) : (
                    <div className="header-download-list">
                      {sortedDownloads.map((item: DownloadItem) => {
                        const sizeLabel = formatDownloadSize(item.downloadedBytes, item.totalBytes);
                        const speedLabel =
                          item.status === "downloading"
                            ? formatSpeed(item.speedBytesPerSec)
                            : item.status === "extracting"
                              ? "Extracting..."
                              : item.status === "completed"
                                ? "Completed"
                                : item.status === "failed"
                                  ? "Failed"
                                  : "";

                        return (
                          <div
                            key={item.id}
                            className="header-download-card"
                            style={{
                              background: theme.secondary,
                              borderColor: theme.border,
                            }}
                          >
                            <div className="header-download-card-header">
                              <span
                                className="header-download-item-title"
                                style={{ color: theme.foreground }}
                              >
                                {item.title}
                              </span>
                              <span
                                className="header-download-item-status"
                                style={{
                                  color:
                                    item.status === "completed"
                                      ? theme.success
                                      : item.status === "failed"
                                        ? theme.destructive
                                        : theme.primary,
                                }}
                              >
                                {item.phaseLabel}
                              </span>
                            </div>

                            {/* Top row: size on top left, speed on top right */}
                            <div className="header-download-card-meta">
                              <span
                                className="header-download-meta-size"
                                style={{ color: theme.mutedForeground }}
                              >
                                {sizeLabel ?? ""}
                              </span>
                              <span
                                className="header-download-meta-speed"
                                style={{ color: theme.mutedForeground }}
                              >
                                {speedLabel}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div
                              className="header-download-progress-track"
                              style={{ background: theme.card }}
                            >
                              <div
                                className="header-download-progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.max(0, item.progress))}%`,
                                  background:
                                    item.status === "failed"
                                      ? theme.destructive
                                      : item.status === "completed"
                                        ? theme.success
                                        : theme.primary,
                                }}
                              />
                            </div>

                            {/* Bottom row: percentage at the bottom of the progress bar */}
                            <div className="header-download-card-bottom">
                              <span
                                className="header-download-meta-percent"
                                style={{ color: theme.foreground }}
                              >
                                {Math.round(item.progress)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="header-task-wrapper" ref={tasksRef}>
          <button
            type="button"
            className="header-task-pill"
            style={{
              background: theme.background,
              color: runningCount > 0 ? theme.foreground : theme.mutedForeground,
            }}
            onClick={() => setShowTasks((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={showTasks}
          >
            <div className="header-task-dot-wrapper">
              {runningCount > 0 && (
                <span className="header-task-dot-pulse" style={{ background: theme.success }} />
              )}
              <span
                className="header-task-dot"
                style={{
                  background: runningCount > 0 ? theme.success : theme.mutedForeground,
                  opacity: runningCount > 0 ? 1 : 0.45,
                }}
              />
            </div>
            <span className="header-task-label">{runningText}</span>
            <motion.span
              className="header-task-chevron"
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
                className="header-task-popover"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={snappy}
                style={{
                  background: theme.card,
                  borderColor: theme.border,
                }}
              >
                <div className="header-task-popover-header" style={{ borderColor: theme.border }}>
                  <span className="header-task-popover-title">Running Tasks</span>
                  <span
                    className="header-task-badge"
                    style={{
                      background: runningCount > 0 ? theme.success : theme.secondary,
                      color: runningCount > 0 ? "#ffffff" : theme.mutedForeground,
                    }}
                  >
                    {runningCount}
                  </span>
                </div>

                {runningCount === 0 ? (
                  <div className="header-task-empty" style={{ color: theme.mutedForeground }}>
                    No instance running
                  </div>
                ) : (
                  <div className="header-task-list">
                    {runningInstances.map((inst) => (
                      <div
                        key={inst.id}
                        className="header-task-item"
                        style={{ background: theme.secondary }}
                      >
                        <div className="header-task-item-left">
                          <span
                            className="header-task-status-dot"
                            style={{ background: theme.success }}
                          />
                          <div className="header-task-item-info">
                            <span
                              className="header-task-item-name"
                              style={{ color: theme.foreground }}
                            >
                              {inst.name}
                            </span>
                            {inst.mcVersion && (
                              <span
                                className="header-task-item-ver"
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
                            className="header-task-kill-btn"
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

        <button
          type="button"
          className="account-chip"
          onClick={onAccountClick}
          title={hasAccount ? `Logged in as ${account?.username}` : "Sign in with Microsoft"}
          style={{ color: hasAccount ? theme.sidebarForeground : theme.mutedForeground }}
        >
          <MinecraftHead
            username={account?.username}
            skinUrl={account?.skinUrl}
            avatarUrl={account?.avatarUrl}
            size={20}
            isGray={!hasAccount}
          />
          <span className="account-name">{displayName}</span>
        </button>

        {/* theme toggle placed directly to the right of the account info */}
        <motion.button
          type="button"
          className="theme-toggle-btn"
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
