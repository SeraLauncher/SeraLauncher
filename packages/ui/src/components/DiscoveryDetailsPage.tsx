import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon } from "./Icon";
import { SafeContentRenderer } from "./SafeContentRenderer";
import { Dropdown } from "./Dropdown";
import { Badge } from "./ui/badge";
import type { Theme } from "../theme";
import type {
  DiscoveryAuthor,
  DiscoveryGalleryItem,
  DiscoveryProject,
  DiscoveryProjectDetails,
  DiscoveryVersion,
  Instance,
  MinecraftVersion,
} from "../instance";

interface DiscoveryDetailsPageProps {
  theme: Theme;
  project: DiscoveryProject;
  instances: Instance[];
  versions: MinecraftVersion[];
  onBack: () => void;
}

type DetailTab = "description" | "versions" | "gallery";

export function shortenLicenseName(name?: string | null): string {
  if (!name) return "Unknown";
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === "mit license" || trimmed.toLowerCase() === "mit") {
    return "MIT License";
  }
  // Shorten BSD variants: BSD 3-Clause "New" or "Revised" License -> BSD 3-Clause
  let cleaned = trimmed.replace(/\s+"[^"]+"\s+or\s+"[^"]+"\s+License/gi, "");
  cleaned = cleaned.replace(/\s+"[^"]+"\s+License/gi, "");
  cleaned = cleaned.replace(/\s*License$/i, "");
  if (cleaned.toLowerCase().startsWith("apache-") || cleaned.toLowerCase().startsWith("apache ")) {
    return cleaned.replace(/^apache[- ](license[- ])?/i, "Apache ");
  }
  if (cleaned.toLowerCase().startsWith("gnu general public license")) {
    return cleaned.replace(/^gnu general public license\s*(v)?/i, "GPL ");
  }
  if (cleaned.toLowerCase().startsWith("gnu lesser general public license")) {
    return cleaned.replace(/^gnu lesser general public license\s*(v)?/i, "LGPL ");
  }
  return cleaned;
}

function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return String(num);
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Unknown";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Module-level in-memory cache for instant 0ms project details and versions loading
const projectDetailsClientCache = new Map<
  string,
  { details: DiscoveryProjectDetails; timestamp: number }
>();
const projectVersionsClientCache = new Map<
  string,
  { versions: DiscoveryVersion[]; timestamp: number }
>();
const PROJECT_CACHE_TTL_MS = 300000; // 5 minutes

function getCachedDetails(key: string): DiscoveryProjectDetails | null {
  const cached = projectDetailsClientCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > PROJECT_CACHE_TTL_MS) {
    projectDetailsClientCache.delete(key);
    return null;
  }
  return cached.details;
}

function setCachedDetails(key: string, details: DiscoveryProjectDetails) {
  projectDetailsClientCache.set(key, { details, timestamp: Date.now() });
}

function getCachedVersions(key: string): DiscoveryVersion[] | null {
  const cached = projectVersionsClientCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > PROJECT_CACHE_TTL_MS) {
    projectVersionsClientCache.delete(key);
    return null;
  }
  return cached.versions;
}

function setCachedVersions(key: string, versions: DiscoveryVersion[]) {
  projectVersionsClientCache.set(key, { versions, timestamp: Date.now() });
}

function preloadImage(url?: string | null) {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

function handleOpenExternal(url?: string | null) {
  if (!url) return;
  openUrl(url).catch(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function GalleryCard({
  item,
  theme,
  onClick,
}: {
  item: DiscoveryGalleryItem;
  theme: Theme;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col rounded-xl border border-border overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] shadow-xs"
      style={{ background: theme.card }}
    >
      {!imgError ? (
        <img
          src={item.thumbnailUrl || item.url}
          alt={item.title || "Screenshot"}
          onError={() => setImgError(true)}
          className="w-full aspect-[16/10] object-cover block"
          loading="lazy"
        />
      ) : (
        <div
          className="w-full aspect-[16/10] flex flex-col items-center justify-center gap-1.5"
          style={{ background: theme.secondary }}
        >
          <Icon name="photo" size={26} color={theme.mutedForeground} />
          <span className="text-[11px] text-muted-foreground font-medium">Image unavailable</span>
        </div>
      )}
      {item.title && (
        <div className="p-2 text-xs font-medium truncate" style={{ color: theme.foreground }}>
          {item.title}
        </div>
      )}
    </div>
  );
}

function CreatorAvatar({ creator, theme }: { creator: DiscoveryAuthor; theme: Theme }) {
  const [avatarError, setAvatarError] = useState(false);

  if (creator.avatarUrl && !avatarError) {
    return (
      <img
        src={creator.avatarUrl}
        alt=""
        onError={() => setAvatarError(true)}
        className="size-6 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <div
      className="size-6 rounded-full flex items-center justify-center border border-border shrink-0"
      style={{ background: theme.card }}
    >
      <Icon name="user" size={12} color={theme.mutedForeground} />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function DiscoveryDetailsPage({
  theme,
  project,
  instances,
  onBack,
}: DiscoveryDetailsPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("description");
  const cacheKey = `${project.source}:${project.id}`;

  const [details, setDetails] = useState<DiscoveryProjectDetails | null>(() =>
    getCachedDetails(cacheKey),
  );
  const [loadingDetails, setLoadingDetails] = useState(() => !getCachedDetails(cacheKey));

  const [versionsList, setVersionsList] = useState<DiscoveryVersion[]>(
    () => getCachedVersions(cacheKey) || [],
  );
  const [loadingVersions, setLoadingVersions] = useState(() => !getCachedVersions(cacheKey));
  const [versionFilterType, setVersionFilterType] = useState<"all" | "release" | "beta" | "alpha">(
    "all",
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Quick Install dialog
  const [installingVersion, setInstallingVersion] = useState<{
    downloadUrl: string;
    fileName: string;
    title: string;
  } | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instances[0]?.id || "");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  // Gallery preview modal
  const [previewImage, setPreviewImage] = useState<{ url: string; title?: string | null } | null>(
    null,
  );
  const [heroIconError, setHeroIconError] = useState(false);

  // Smart details prefetcher & background image preloader
  useEffect(() => {
    const cached = getCachedDetails(cacheKey);
    if (cached) {
      // Preload gallery thumbnails in background with staggered timing so UI never stutters
      if (cached.gallery && cached.gallery.length > 0) {
        cached.gallery.slice(0, 15).forEach((g, idx) => {
          const url = g.thumbnailUrl || g.url;
          if (url) {
            setTimeout(() => preloadImage(url), idx * 40);
          }
        });
      }
      return;
    }

    let active = true;
    invoke<DiscoveryProjectDetails>("get_discovery_project_details", {
      provider: project.source,
      projectId: project.id,
    })
      .then((res) => {
        if (!active) return;
        setCachedDetails(cacheKey, res);
        setDetails(res);
        setLoadingDetails(false);

        // Preload gallery screenshots into browser image cache
        if (res.gallery && res.gallery.length > 0) {
          res.gallery.slice(0, 15).forEach((g, idx) => {
            const url = g.thumbnailUrl || g.url;
            if (url) {
              setTimeout(() => preloadImage(url), idx * 40);
            }
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setLoadingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [cacheKey, project.source, project.id]);

  // Smart background versions prefetcher (fetches in background on mount)
  useEffect(() => {
    const cached = getCachedVersions(cacheKey);
    if (cached) return;

    let active = true;
    // Low priority background fetch after layout settles
    const timer = setTimeout(() => {
      invoke<DiscoveryVersion[]>("get_discovery_project_versions", {
        provider: project.source,
        projectId: project.id,
        mcVersion: null,
        loader: null,
      })
        .then((res) => {
          if (!active) return;
          const versions = res || [];
          setCachedVersions(cacheKey, versions);
          setVersionsList(versions);
          setLoadingVersions(false);
        })
        .catch(() => {
          if (!active) return;
          setLoadingVersions(false);
        });
    }, 50);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cacheKey, project.source, project.id]);

  const filteredVersions = useMemo(() => {
    if (versionFilterType === "all") return versionsList;
    return versionsList.filter((v) => v.versionType.toLowerCase() === versionFilterType);
  }, [versionsList, versionFilterType]);

  const handleInstall = async () => {
    if (!installingVersion || !selectedInstanceId) return;
    setIsInstalling(true);
    setInstallSuccess(null);

    try {
      await invoke("install_discovery_project", {
        instanceId: selectedInstanceId,
        projectType: details?.projectType || project.projectType,
        downloadUrl: installingVersion.downloadUrl,
        fileName: installingVersion.fileName,
      });

      const targetInst = instances.find((i) => i.id === selectedInstanceId)?.name || "instance";
      setInstallSuccess(`Installed into ${targetInst}!`);
      setTimeout(() => {
        setInstallingVersion(null);
        setInstallSuccess(null);
      }, 1600);
    } catch {
      // fallback
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyLink = () => {
    const webUrl = details?.webUrl || project.slug;
    if (webUrl) {
      navigator.clipboard.writeText(webUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const dlCount = formatCompactNumber(details?.downloads ?? project.downloads);
  const followCount =
    details?.follows || project.follows
      ? formatCompactNumber((details?.follows ?? project.follows) || 0)
      : null;

  return (
    <main
      className="relative flex-1 flex flex-row h-full overflow-hidden"
      style={{ background: theme.sidebar }}
    >
      {/* Left Column: Top Hero, Tabs, Content */}
      <div
        className="flex-1 flex flex-col h-full overflow-hidden p-6 pr-5 gap-4 min-w-0 rounded-tr-[14px]"
        style={{ background: theme.background }}
      >
        {/* Top Back Navigation Bar */}
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold cursor-pointer transition-colors hover:bg-card"
            style={{ background: theme.secondary, color: theme.foreground }}
          >
            <Icon name="arrowLeft" size={14} color="currentColor" />
            <span>Back to Discovery</span>
          </button>

          <span className="text-xs font-medium" style={{ color: theme.mutedForeground }}>
            {project.source === "modrinth" ? "Modrinth" : "CurseForge"} ·{" "}
            {capitalizeFirst(project.projectType)}
          </span>
        </div>

        {/* Hero Top Section */}
        <div
          className="flex items-start justify-between p-4.5 rounded-2xl border border-border gap-4 shadow-xs"
          style={{ background: theme.card }}
        >
          {/* Thumbnail & Info */}
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {project.iconUrl && !heroIconError ? (
              <img
                src={project.iconUrl}
                alt=""
                onError={() => setHeroIconError(true)}
                className="w-18 h-18 rounded-xl object-cover flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <div
                className="w-18 h-18 rounded-xl flex items-center justify-center flex-shrink-0 border border-border"
                style={{ background: theme.secondary }}
              >
                <Icon name="cubes" size={28} color={theme.mutedForeground} />
              </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className="text-lg font-bold tracking-tight truncate leading-tight"
                  style={{ color: theme.foreground }}
                >
                  {project.title}
                </h1>
                <span className="text-xs font-medium" style={{ color: theme.mutedForeground }}>
                  by {project.author}
                </span>
              </div>

              <p
                className="text-xs line-clamp-2 leading-relaxed"
                style={{ color: theme.mutedForeground }}
              >
                {details?.summary || project.description}
              </p>

              {/* Metrics & Badges */}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <div
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: theme.mutedForeground }}
                  title="Total Downloads"
                >
                  <Icon name="download" size={12} color="currentColor" />
                  <span>{dlCount}</span>
                </div>

                {followCount && (
                  <div
                    className="flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: theme.mutedForeground }}
                    title="Follows / Likes"
                  >
                    <Icon name="heart" size={12} color="currentColor" />
                    <span>{followCount}</span>
                  </div>
                )}

                {/* Categories */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {project.categories.slice(0, 3).map((cat) => (
                    <Badge key={cat} variant="environment">
                      {capitalizeFirst(cat)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setInstallingVersion({
                  downloadUrl: project.downloadUrl || "",
                  fileName: `${project.slug || "addon"}.jar`,
                  title: project.title,
                });
              }}
              className="h-8 px-4 text-xs font-bold rounded-lg border-0 bg-primary text-primary-foreground cursor-pointer transition-opacity hover:opacity-90 shadow-sm"
            >
              Install
            </button>

            {/* 3-Dots Action Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center cursor-pointer transition-colors hover:bg-secondary"
                style={{ background: theme.card }}
                title="More actions"
              >
                <Icon name="dots" size={15} color={theme.foreground} />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+6px)] w-52 p-1 rounded-xl border border-border bg-card shadow-xl z-30 flex flex-col gap-0.5"
                  style={{ background: theme.card }}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenExternal(details?.webUrl);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-secondary cursor-pointer text-left"
                    style={{ color: theme.foreground }}
                  >
                    <Icon name="externalLink" size={13} color={theme.mutedForeground} />
                    <span>Open in {project.source === "modrinth" ? "Modrinth" : "CurseForge"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleOpenExternal(details?.reportUrl);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-destructive/15 text-destructive cursor-pointer text-left"
                  >
                    <Icon name="flag" size={13} color="currentColor" />
                    <span>Report Project</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleCopyLink();
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-secondary cursor-pointer text-left border-t border-border/50"
                    style={{ color: theme.mutedForeground }}
                  >
                    <Icon name="link" size={13} color="currentColor" />
                    <span>{copiedLink ? "Link Copied!" : "Copy Project Link"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Tabs Navigation */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg border border-border w-fit"
          style={{ background: theme.secondary }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("description")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
            style={{
              background: activeTab === "description" ? theme.card : "transparent",
              color: activeTab === "description" ? theme.foreground : theme.mutedForeground,
              boxShadow: activeTab === "description" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Icon name="book" size={13} color="currentColor" />
            <span>Description</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("versions")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
            style={{
              background: activeTab === "versions" ? theme.card : "transparent",
              color: activeTab === "versions" ? theme.foreground : theme.mutedForeground,
              boxShadow: activeTab === "versions" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Icon name="cubes" size={13} color="currentColor" />
            <span>Versions</span>
            {versionsList.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-sidebarAccent opacity-80">
                {versionsList.length}
              </span>
            )}
          </button>

          {details?.gallery && details.gallery.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("gallery")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer"
              style={{
                background: activeTab === "gallery" ? theme.card : "transparent",
                color: activeTab === "gallery" ? theme.foreground : theme.mutedForeground,
                boxShadow: activeTab === "gallery" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              <Icon name="photo" size={13} color="currentColor" />
              <span>Gallery</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-sidebarAccent opacity-80">
                {details.gallery.length}
              </span>
            </button>
          )}
        </div>

        {/* Tab 1: Description Content Box */}
        {activeTab === "description" && (
          <div className="flex-1 overflow-y-auto pr-2 pb-6">
            {loadingDetails ? (
              <div
                className="p-6 rounded-2xl border border-border flex flex-col gap-3 shadow-xs"
                style={{ background: theme.card }}
              >
                <div className="h-6 w-1/3 rounded-lg bg-secondary animate-pulse" />
                <div className="h-24 w-full rounded-lg bg-secondary animate-pulse" />
                <div className="h-36 w-full rounded-lg bg-secondary animate-pulse" />
              </div>
            ) : details?.description ? (
              <div
                className="p-6 rounded-2xl border border-border shadow-xs"
                style={{ background: theme.card }}
              >
                <SafeContentRenderer
                  content={details.description}
                  type={details.descriptionType as any}
                  theme={theme}
                />
              </div>
            ) : (
              <div
                className="p-8 rounded-2xl border border-border text-center text-xs text-muted-foreground shadow-xs"
                style={{ background: theme.card }}
              >
                No description provided for this project.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Versions List */}
        {activeTab === "versions" && (
          <div className="flex-1 flex flex-col overflow-hidden gap-3 pb-6">
            {/* Version channel filter chips */}
            <div className="flex items-center gap-1.5 text-xs">
              {(["all", "release", "beta", "alpha"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setVersionFilterType(type)}
                  className="px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer transition-colors capitalize"
                  style={{
                    background: versionFilterType === type ? theme.primary : theme.secondary,
                    color:
                      versionFilterType === type ? theme.primaryForeground : theme.mutedForeground,
                    borderColor: theme.border,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
              {loadingVersions ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-xl border border-border bg-card animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredVersions.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No versions matching current filter.
                </div>
              ) : (
                filteredVersions.map((v) => {
                  const badgeColor =
                    v.versionType === "release"
                      ? "text-emerald-500 bg-emerald-500/15 border-emerald-500/30"
                      : v.versionType === "beta"
                        ? "text-amber-500 bg-amber-500/15 border-amber-500/30"
                        : "text-rose-500 bg-rose-500/15 border-rose-500/30";

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border gap-4 transition-colors hover:bg-card/70"
                      style={{ background: theme.card }}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider border shrink-0 mt-0.5 ${badgeColor}`}
                        >
                          {v.versionType}
                        </span>

                        <div className="flex flex-col min-w-0 gap-0.5">
                          <span
                            className="text-xs font-semibold truncate leading-tight"
                            style={{ color: theme.foreground }}
                          >
                            {v.name || v.versionNumber}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono truncate">
                            {v.fileName}
                          </span>

                          <div className="flex items-center gap-2 text-[10px] mt-1 text-muted-foreground flex-wrap">
                            <span>MC: {v.gameVersions.slice(0, 3).join(", ")}</span>
                            <span>•</span>
                            <span>{v.loaders.join(", ") || "Vanilla"}</span>
                            <span>•</span>
                            <span>{formatBytes(v.fileSize)}</span>
                            <span>•</span>
                            <span>{formatDate(v.datePublished)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setInstallingVersion({
                            downloadUrl: v.downloadUrl,
                            fileName: v.fileName,
                            title: `${project.title} (${v.versionNumber})`,
                          });
                        }}
                        className="px-3 py-1 text-xs font-semibold rounded-md border-0 bg-primary text-primary-foreground cursor-pointer transition-opacity hover:opacity-90 shrink-0"
                      >
                        Install
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Gallery Grid */}
        {activeTab === "gallery" && details?.gallery && (
          <div className="flex-1 overflow-y-auto pr-2 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
              {details.gallery.map((item, idx) => (
                <GalleryCard
                  key={idx}
                  item={item}
                  theme={theme}
                  onClick={() => setPreviewImage({ url: item.url, title: item.title })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Details Sidebar */}
      <aside
        className="w-64 h-full flex flex-col border-l border-border p-4.5 gap-4.5 overflow-y-auto flex-shrink-0"
        style={{ background: theme.sidebar }}
      >
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: theme.foreground }}
        >
          Project Details
        </span>

        {/* Compatibility Section */}
        <div className="flex flex-col gap-2.5">
          <label
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: theme.mutedForeground }}
          >
            Compatibility
          </label>

          {/* 1. Minecraft Versions (max 8 badges, no scrollbar) */}
          {details?.supportedVersions && details.supportedVersions.length > 0 && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                Minecraft Versions
              </span>
              <div className="flex flex-wrap gap-1 items-center">
                {details.supportedVersions.slice(0, 8).map((v) => (
                  <Badge key={v} variant="environment" className="font-mono">
                    {v}
                  </Badge>
                ))}
                {details.supportedVersions.length > 8 && (
                  <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                    +{details.supportedVersions.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 2. Mod Loaders */}
          {details?.supportedLoaders && details.supportedLoaders.length > 0 && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                Mod Loaders
              </span>
              <div className="flex flex-wrap gap-1">
                {details.supportedLoaders.map((l) => (
                  <Badge key={l} variant="environment">
                    {capitalizeFirst(l)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 3. Environment */}
          {details?.environment && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                Environment
              </span>
              <div className="w-fit">
                <Badge
                  variant="environment"
                  icon={
                    <Icon
                      name={
                        details.environment === "server"
                          ? "server"
                          : details.environment === "client"
                            ? "computer"
                            : "globe"
                      }
                      size={12}
                      color={theme.primary}
                    />
                  }
                >
                  {details.environment === "both"
                    ? "Client & Server"
                    : capitalizeFirst(details.environment)}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Links Section */}
        {details?.links && Object.values(details.links).some(Boolean) && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
            <label
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: theme.mutedForeground }}
            >
              Links
            </label>
            <div className="flex flex-col gap-1">
              {details.links.source && (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.links.source)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-card cursor-pointer text-left"
                  style={{ color: theme.foreground }}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="github" size={13} color={theme.primary} />
                    <span>Source Code</span>
                  </span>
                  <Icon name="externalLink" size={12} color={theme.mutedForeground} />
                </button>
              )}

              {details.links.issues && (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.links.issues)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-card cursor-pointer text-left"
                  style={{ color: theme.foreground }}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="bug" size={13} color={theme.primary} />
                    <span>Issues</span>
                  </span>
                  <Icon name="externalLink" size={12} color={theme.mutedForeground} />
                </button>
              )}

              {details.links.wiki && (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.links.wiki)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-card cursor-pointer text-left"
                  style={{ color: theme.foreground }}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="book" size={13} color={theme.primary} />
                    <span>Wiki</span>
                  </span>
                  <Icon name="externalLink" size={12} color={theme.mutedForeground} />
                </button>
              )}

              {details.links.discord && (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.links.discord)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-card cursor-pointer text-left"
                  style={{ color: theme.foreground }}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="discord" size={13} color={theme.primary} />
                    <span>Discord</span>
                  </span>
                  <Icon name="externalLink" size={12} color={theme.mutedForeground} />
                </button>
              )}

              {details.links.donate && (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.links.donate)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-card cursor-pointer text-left"
                  style={{ color: theme.foreground }}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="heart" size={13} color={theme.primary} />
                    <span>Donate</span>
                  </span>
                  <Icon name="externalLink" size={12} color={theme.mutedForeground} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tags / Categories */}
        {details?.categories && details.categories.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
            <label
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: theme.mutedForeground }}
            >
              Tags & Categories
            </label>
            <div className="flex flex-wrap gap-1">
              {details.categories.map((c) => (
                <Badge key={c} variant="environment">
                  {capitalizeFirst(c)}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {/* Creators */}
        {details?.creators && details.creators.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
            <label
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: theme.mutedForeground }}
            >
              Creators ({details.creators.length})
            </label>
            <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto">
              {details.creators.map((c: DiscoveryAuthor) => (
                <div key={c.id || c.name} className="flex items-center gap-2 text-xs">
                  <CreatorAvatar creator={c} theme={theme} />
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-semibold truncate leading-tight"
                      style={{ color: theme.foreground }}
                    >
                      {c.name}
                    </span>
                    {c.role && (
                      <span className="text-[10px] text-muted-foreground truncate leading-tight">
                        {c.role}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Details */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/60 text-xs mt-auto">
          {details?.license && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                License
              </span>
              {details.license.url ? (
                <button
                  type="button"
                  onClick={() => handleOpenExternal(details.license?.url)}
                  className="text-xs font-semibold underline text-primary cursor-pointer truncate max-w-[150px] text-right"
                  title={details.license.name}
                >
                  {shortenLicenseName(details.license.name)}
                </button>
              ) : (
                <span
                  className="text-xs font-medium truncate max-w-[150px] text-right"
                  style={{ color: theme.foreground }}
                  title={details.license.name}
                >
                  {shortenLicenseName(details.license.name)}
                </span>
              )}
            </div>
          )}

          {details?.publishedDate && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                Published
              </span>
              <span className="text-xs font-medium font-mono" style={{ color: theme.foreground }}>
                {formatDate(details.publishedDate)}
              </span>
            </div>
          )}

          {details?.updatedDate && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
                Updated
              </span>
              <span className="text-xs font-medium font-mono" style={{ color: theme.foreground }}>
                {formatDate(details.updatedDate)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: theme.mutedForeground }}>
              Project ID
            </span>
            <span className="text-xs font-mono text-muted-foreground select-all">{project.id}</span>
          </div>
        </div>
      </aside>

      {/* Quick Install Dialog */}
      {installingVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-border p-5 shadow-2xl flex flex-col gap-4"
            style={{ background: theme.card }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: theme.foreground }}>
                Install {installingVersion.title}
              </h2>
              <button
                type="button"
                onClick={() => setInstallingVersion(null)}
                className="text-xs p-1 rounded cursor-pointer"
                style={{ color: theme.mutedForeground }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: theme.mutedForeground }}>
              Choose which instance to install this {details?.projectType || project.projectType}{" "}
              into:
            </p>

            {instances.length === 0 ? (
              <div
                className="text-xs p-3 rounded-lg border border-border text-center"
                style={{ background: theme.secondary, color: theme.mutedForeground }}
              >
                No instances created yet. Please create an instance first!
              </div>
            ) : (
              <div className="w-full">
                <Dropdown
                  value={selectedInstanceId}
                  options={instances.map((i) => i.id)}
                  render={(id) => {
                    const inst = instances.find((i) => i.id === id);
                    return inst
                      ? `${inst.name} (${inst.loader ? inst.loader : "Vanilla"} ${inst.mcVersion})`
                      : id;
                  }}
                  onChange={(id) => setSelectedInstanceId(id)}
                  theme={theme}
                />
              </div>
            )}

            {installSuccess && (
              <div className="text-xs text-center font-medium py-1 text-emerald-500">
                ✓ {installSuccess}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setInstallingVersion(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border cursor-pointer"
                style={{ color: theme.foreground }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={instances.length === 0 || isInstalling}
                onClick={handleInstall}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50 transition-opacity cursor-pointer"
                style={{
                  background: theme.primary,
                  color: theme.primaryForeground,
                }}
              >
                {isInstalling ? "Installing..." : "Install Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery Lightbox Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[85vh] flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt=""
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
            {previewImage.title && (
              <span className="text-sm font-medium text-white/90 text-center">
                {previewImage.title}
              </span>
            )}
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 size-7 rounded-full bg-black/80 text-white flex items-center justify-center border border-white/20 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
