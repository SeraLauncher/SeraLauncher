import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon, SiCurseforge, SiModrinth } from "./Icon";
import { Dropdown } from "./Dropdown";
import type { Theme } from "../theme";
import type {
  DiscoveryProject,
  DiscoverySearchResponse,
  Instance,
  MinecraftVersion,
} from "../instance";

export type DiscoveryCategory = "modpack" | "mods" | "resourcepack" | "shader";
export type DiscoveryProvider = "modrinth" | "curseforge";
export type EnvironmentFilter = "all" | "client" | "server";

interface DiscoveryPageProps {
  theme: Theme;
  instances: Instance[];
  versions: MinecraftVersion[];
}

function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    return `${Math.floor(diffMonth / 12)}y ago`;
  } catch {
    return "";
  }
}

// In-memory cache to make provider and filter switches instantaneous
const discoveryClientCache = new Map<
  string,
  { projects: DiscoveryProject[]; totalHits: number; timestamp: number }
>();
const CLIENT_CACHE_TTL_MS = 180000; // 3 minutes

export function DiscoveryPage({ theme, instances, versions }: DiscoveryPageProps) {
  const [provider, setProvider] = useState<DiscoveryProvider>("modrinth");
  const [category, setCategory] = useState<DiscoveryCategory>("modpack");
  const [search, setSearch] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<string>("all");
  const [selectedLoader, setSelectedLoader] = useState<string>("all");
  const [environment, setEnvironment] = useState<EnvironmentFilter>("all");
  const [sort, setSort] = useState<string>("relevance");

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<DiscoveryProject[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const totalPages = Math.max(1, Math.ceil(totalHits / limit));
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInputVal, setPageInputVal] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleJumpPage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const parsed = parseInt(pageInputVal, 10);
      if (!isNaN(parsed)) {
        const target = Math.max(1, Math.min(totalPages, parsed));
        setPage(target);
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
      setIsEditingPage(false);
    } else if (e.key === "Escape") {
      setIsEditingPage(false);
    }
  };

  // Reset page when any filter changes
  const filterKey = `${provider}-${category}-${search}-${selectedVersion}-${selectedLoader}-${environment}-${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // Quick install dialog state
  const [installingProject, setInstallingProject] = useState<DiscoveryProject | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(instances[0]?.id || "");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  // Previous search ref to only debounce text typing, not tab/provider/filter switches
  const prevSearchRef = useRef(search);

  useEffect(() => {
    let active = true;
    const cacheKey = `${provider}:${category}:${search.trim().toLowerCase()}:${selectedVersion}:${selectedLoader}:${environment}:${sort}:${page}`;
    const cached = discoveryClientCache.get(cacheKey);

    const searchChanged = prevSearchRef.current !== search;
    prevSearchRef.current = search;
    const debounceMs = searchChanged ? 280 : 0;

    const timer = setTimeout(() => {
      // If cached in memory, restore immediately without spinner
      if (cached) {
        setProjects(cached.projects);
        setTotalHits(cached.totalHits);
        setLoading(false);
        if (Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
          return;
        }
      } else {
        setLoading(true);
      }

      invoke<DiscoverySearchResponse>("search_discovery", {
        provider,
        projectType: category,
        query: search.trim() || null,
        mcVersion: selectedVersion === "all" ? null : selectedVersion,
        loader: selectedLoader === "all" ? null : selectedLoader,
        environment: provider === "modrinth" && environment !== "all" ? environment : null,
        sort,
        offset: (page - 1) * limit,
        limit,
      })
        .then((res) => {
          if (!active) return;
          const projs = res.projects || [];
          const hits = res.totalHits || 0;
          discoveryClientCache.set(cacheKey, {
            projects: projs,
            totalHits: hits,
            timestamp: Date.now(),
          });
          setProjects(projs);
          setTotalHits(hits);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          if (!cached) {
            setProjects([]);
            setTotalHits(0);
          }
          setLoading(false);
        });
    }, debounceMs);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, category, search, selectedVersion, selectedLoader, environment, sort, page]);

  const versionOptions = useMemo(() => {
    const list = versions
      .filter((v) => v.type === "release")
      .slice(0, 30)
      .map((v) => v.id);
    return ["all", ...list];
  }, [versions]);

  const loaderOptions = ["all", "fabric", "forge", "neoforge", "quilt"] as const;
  const environmentOptions = ["all", "client", "server"] as const;
  const sortOptions = ["relevance", "downloads", "updated", "newest"] as const;

  const handleInstallFile = async () => {
    if (!installingProject || !selectedInstanceId) return;
    setIsInstalling(true);
    setInstallSuccess(null);

    try {
      const fileName = `${installingProject.slug || "addon"}.jar`;
      const downloadUrl =
        installingProject.downloadUrl ||
        `https://api.modrinth.com/v2/project/${installingProject.id}/version`;

      await invoke("install_discovery_project", {
        instanceId: selectedInstanceId,
        projectType: installingProject.projectType,
        downloadUrl,
        fileName,
      });

      setInstallSuccess(
        `Installed into ${instances.find((i) => i.id === selectedInstanceId)?.name}!`,
      );
      setTimeout(() => {
        setInstallingProject(null);
        setInstallSuccess(null);
      }, 1800);
    } catch {
      // fallback
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <main
      className="relative flex-1 flex flex-row h-full overflow-hidden"
      style={{ background: theme.sidebar }}
    >
      {/* Left Column: Content Area curving inward with borderTopRightRadius: 14 */}
      <div
        className="flex-1 flex flex-col h-full overflow-hidden p-6 pr-5 gap-3.5 min-w-0 rounded-tr-[14px]"
        style={{
          background: theme.background,
          borderTopRightRadius: 14,
        }}
      >
        {/* Top Bar: Category tabs on left, Provider toggle on right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Categories */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg border border-border"
            style={{ background: theme.secondary }}
          >
            {(
              [
                { id: "modpack", label: "Modpacks", icon: "cubes" },
                { id: "mods", label: "Mods", icon: "puzzle" },
                { id: "resourcepack", label: "Resource Packs", icon: "palette" },
                { id: "shader", label: "Shaders", icon: "wand" },
              ] as const
            ).map((tab) => {
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer"
                  style={{
                    background: active ? theme.card : "transparent",
                    color: active ? theme.foreground : theme.mutedForeground,
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    fontSize: "0.82rem",
                    lineHeight: 1.2,
                  }}
                >
                  <Icon
                    name={tab.icon as any}
                    size={15}
                    color={active ? theme.primary : theme.mutedForeground}
                  />
                  <span style={{ fontSize: "0.82rem" }}>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Provider Switcher */}
          <div
            className="flex items-center p-1 rounded-lg border border-border gap-1"
            style={{ background: theme.sidebarAccent }}
          >
            <button
              type="button"
              onClick={() => setProvider("modrinth")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer"
              style={{
                background: provider === "modrinth" ? theme.primary : "transparent",
                color: provider === "modrinth" ? theme.primaryForeground : theme.mutedForeground,
                fontWeight: provider === "modrinth" ? 600 : 500,
                fontSize: "0.82rem",
                lineHeight: 1.2,
              }}
            >
              <SiModrinth size={14} color="currentColor" />
              <span>Modrinth</span>
            </button>
            <button
              type="button"
              onClick={() => setProvider("curseforge")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer"
              style={{
                background: provider === "curseforge" ? theme.primary : "transparent",
                color: provider === "curseforge" ? theme.primaryForeground : theme.mutedForeground,
                fontWeight: provider === "curseforge" ? 600 : 500,
                fontSize: "0.82rem",
                lineHeight: 1.2,
              }}
            >
              <SiCurseforge size={14} color="currentColor" />
              <span>CurseForge</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div
          className="w-full h-[36px] flex items-center gap-2 px-3 rounded-lg border border-border"
          style={{ background: theme.secondary }}
        >
          <Icon name="search" size={14} color={theme.mutedForeground} />
          <input
            type="text"
            placeholder={`Search ${category}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-transparent outline-none border-none h-full"
            style={{ color: theme.foreground }}
          />
        </div>

        {/* Results Count & Arrow-only Pagination */}
        <div
          className="flex items-center justify-between text-xs px-1"
          style={{ color: theme.mutedForeground }}
        >
          <span>
            {loading
              ? "Searching..."
              : totalHits === 0
                ? "No results"
                : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, totalHits)} of ${totalHits.toLocaleString()} results`}
          </span>

          {/* Enhanced Pagination: Previous, Current Page, Jump Ellipsis (...), Last Page, Next */}
          <div className="flex items-center gap-1.5">
            {/* Previous Page Button */}
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              title="Previous Page"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-border disabled:opacity-30 transition-opacity cursor-pointer disabled:cursor-not-allowed"
              style={{ background: theme.secondary, color: theme.foreground }}
            >
              <Icon name="arrowLeft" size={13} color="currentColor" />
            </button>

            {/* Current Page Button */}
            <button
              type="button"
              title={`Current page ${page}`}
              className="h-7 px-2.5 flex items-center justify-center rounded-md text-xs font-semibold select-none"
              style={{
                background: theme.primary,
                color: theme.primaryForeground,
              }}
            >
              {page}
            </button>

            {/* Ellipsis / Number Jump Input & Last Page */}
            {totalPages > 1 && page < totalPages && (
              <>
                {isEditingPage ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    placeholder={String(page)}
                    value={pageInputVal}
                    onChange={(e) => setPageInputVal(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={handleJumpPage}
                    onBlur={() => {
                      if (pageInputVal.trim()) {
                        const parsed = parseInt(pageInputVal, 10);
                        if (!isNaN(parsed)) {
                          const target = Math.max(1, Math.min(totalPages, parsed));
                          setPage(target);
                          scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }
                      setIsEditingPage(false);
                    }}
                    className="w-12 h-7 px-1 text-center text-xs font-semibold rounded-md border border-border outline-none focus:border-primary"
                    style={{
                      background: theme.secondary,
                      color: theme.foreground,
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    title="Click to jump to a page number"
                    onClick={() => {
                      setPageInputVal("");
                      setIsEditingPage(true);
                    }}
                    className="h-7 px-1.5 flex items-center justify-center rounded-md text-xs font-semibold border border-transparent hover:border-border cursor-pointer transition-colors"
                    style={{ color: theme.mutedForeground }}
                  >
                    ...
                  </button>
                )}

                {/* Clickable Last Page Button */}
                <button
                  type="button"
                  onClick={() => {
                    setPage(totalPages);
                    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  title={`Jump to last page (${totalPages})`}
                  className="h-7 px-2.5 flex items-center justify-center rounded-md border border-border text-xs font-medium cursor-pointer transition-colors hover:bg-card"
                  style={{
                    background: theme.secondary,
                    color: theme.foreground,
                  }}
                >
                  {totalPages}
                </button>
              </>
            )}

            {/* Next Page Button */}
            <button
              type="button"
              disabled={page >= totalPages || loading || projects.length === 0}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              title="Next Page"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-border disabled:opacity-30 transition-opacity cursor-pointer disabled:cursor-not-allowed"
              style={{ background: theme.secondary, color: theme.foreground }}
            >
              <Icon name="arrowRight" size={13} color="currentColor" />
            </button>
          </div>
        </div>

        {/* Results List: 1 Card per line */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl border border-border animate-pulse"
                  style={{ background: theme.card }}
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-64 rounded-xl border border-border"
              style={{ background: theme.card }}
            >
              <Icon name="search" size={28} color={theme.mutedForeground} />
              <span className="text-sm font-medium mt-3" style={{ color: theme.foreground }}>
                No {category} found
              </span>
              <span className="text-xs mt-1" style={{ color: theme.mutedForeground }}>
                Try adjusting your search query or filters in the sidebar
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-6">
              {projects.map((item) => {
                const dlCount =
                  item.downloads >= 1_000_000
                    ? `${(item.downloads / 1_000_000).toFixed(1)}M`
                    : item.downloads >= 1_000
                      ? `${Math.round(item.downloads / 1_000)}k`
                      : `${item.downloads}`;

                const followCount = item.follows
                  ? item.follows >= 1_000_000
                    ? `${(item.follows / 1_000_000).toFixed(1)}M`
                    : item.follows >= 1_000
                      ? `${Math.round(item.follows / 1_000)}k`
                      : `${item.follows}`
                  : null;

                const timeLabel = formatRelativeTime(item.dateModified);

                return (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="flex items-start justify-between p-3 rounded-xl border border-border gap-3.5 transition-all hover:shadow-md"
                    style={{ background: theme.card }}
                  >
                    {/* Left Group: Icon + Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {item.iconUrl ? (
                        <img
                          src={item.iconUrl}
                          alt=""
                          className="w-[72px] h-[72px] rounded-xl object-cover flex-shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="w-[72px] h-[72px] rounded-xl flex items-center justify-center flex-shrink-0 border border-border"
                          style={{ background: theme.secondary }}
                        >
                          <Icon name="cubes" size={26} color={theme.mutedForeground} />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 h-[72px] flex flex-col justify-between">
                        {/* Top Section: Title and Description directly underneath */}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <h3
                              className="text-sm font-semibold truncate leading-none"
                              style={{ color: theme.foreground }}
                              title={item.title}
                            >
                              {item.title}
                            </h3>
                            <span
                              className="text-xs flex-shrink-0 leading-none"
                              style={{ color: theme.mutedForeground }}
                            >
                              by {item.author}
                            </span>
                          </div>

                          <p
                            className="text-xs line-clamp-2 mt-1 leading-snug overflow-hidden"
                            style={{ color: theme.mutedForeground }}
                          >
                            {item.description}
                          </p>
                        </div>

                        {/* Bottom Section: Badges sitting flush with the bottom of the 72px image */}
                        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                          {item.environment === "both" && (
                            <span
                              className="inline-flex items-center justify-center gap-1.5 h-[20px] text-[11px] px-2 rounded-md font-medium border border-border leading-none"
                              style={{ background: theme.sidebarAccent, color: theme.foreground }}
                            >
                              <Icon name="globe" size={12} color={theme.primary} />
                              <span>Client & Server</span>
                            </span>
                          )}
                          {item.environment === "client" && (
                            <span
                              className="inline-flex items-center justify-center gap-1.5 h-[20px] text-[11px] px-2 rounded-md font-medium border border-border leading-none"
                              style={{ background: theme.sidebarAccent, color: theme.foreground }}
                            >
                              <Icon name="computer" size={12} color={theme.primary} />
                              <span>Client</span>
                            </span>
                          )}
                          {item.environment === "server" && (
                            <span
                              className="inline-flex items-center justify-center gap-1.5 h-[20px] text-[11px] px-2 rounded-md font-medium border border-border leading-none"
                              style={{ background: theme.sidebarAccent, color: theme.foreground }}
                            >
                              <Icon name="server" size={12} color={theme.primary} />
                              <span>Server</span>
                            </span>
                          )}

                          {item.categories.slice(0, 4).map((cat) => (
                            <span
                              key={cat}
                              className="inline-flex items-center justify-center h-[20px] text-[11px] px-2 rounded-md font-medium border border-border leading-none"
                              style={{ background: theme.secondary, color: theme.mutedForeground }}
                            >
                              <span>{capitalizeFirst(cat)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right Group: Install Button on top, metrics flush at bottom */}
                    <div className="h-[72px] flex flex-col justify-between items-end flex-shrink-0 pl-2">
                      <button
                        type="button"
                        onClick={() => setInstallingProject(item)}
                        className="h-[26px] px-3 text-xs font-semibold rounded-md transition-opacity hover:opacity-90 cursor-pointer flex items-center justify-center leading-none"
                        style={{
                          background: theme.primary,
                          color: theme.primaryForeground,
                        }}
                      >
                        Install
                      </button>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div
                          className="flex items-center gap-2 text-[11px]"
                          style={{ color: theme.mutedForeground }}
                        >
                          <div
                            className="inline-flex items-center gap-1 font-medium leading-none"
                            title="Downloads"
                          >
                            <Icon name="download" size={11} color="currentColor" />
                            <span>{dlCount}</span>
                          </div>

                          {followCount && (
                            <div
                              className="inline-flex items-center gap-1 font-medium leading-none"
                              title="Likes / Follows"
                            >
                              <Icon name="heart" size={11} color="currentColor" />
                              <span>{followCount}</span>
                            </div>
                          )}
                        </div>

                        {timeLabel && (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] font-medium leading-none"
                            title={`Updated: ${item.dateModified}`}
                            style={{ color: theme.mutedForeground }}
                          >
                            <Icon name="clock" size={11} color={theme.primary} />
                            <span>{timeLabel}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar: Static flush sidebar panel with compact width */}
      <aside
        className="w-56 h-full flex flex-col border-l border-border p-4.5 gap-4.5 overflow-y-auto flex-shrink-0"
        style={{ background: theme.sidebar }}
      >
        <div className="flex items-center gap-2">
          <Icon name="filter" size={14} color={theme.primary} />
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: theme.foreground }}
          >
            Filters
          </span>
        </div>

        {/* Sort Filter */}
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: theme.mutedForeground }}
          >
            <Icon name="sortArrows" size={12} color={theme.mutedForeground} />
            Sort By
          </label>
          <div className="w-full">
            <Dropdown
              value={sort}
              options={sortOptions}
              render={(opt) => {
                if (opt === "relevance") return "Relevance";
                if (opt === "downloads") return "Most Downloads";
                if (opt === "updated") return "Recently Updated";
                return "Newest";
              }}
              onChange={(opt) => setSort(opt)}
              theme={theme}
            />
          </div>
        </div>

        {/* Minecraft Version Filter */}
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: theme.mutedForeground }}
          >
            <Icon name="cubes" size={12} color={theme.mutedForeground} />
            Game Version
          </label>
          <div className="w-full">
            <Dropdown
              value={selectedVersion}
              options={versionOptions}
              render={(opt) => (opt === "all" ? "All Versions" : opt)}
              onChange={(opt) => setSelectedVersion(opt)}
              theme={theme}
            />
          </div>
        </div>

        {/* Loader Filter (for mods and modpacks) */}
        {(category === "mods" || category === "modpack") && (
          <div className="flex flex-col gap-1.5">
            <label
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: theme.mutedForeground }}
            >
              <Icon name="puzzle" size={12} color={theme.mutedForeground} />
              Mod Loader
            </label>
            <div className="w-full">
              <Dropdown
                value={selectedLoader}
                options={loaderOptions}
                render={(opt) =>
                  opt === "all" ? "All Loaders" : opt.charAt(0).toUpperCase() + opt.slice(1)
                }
                onChange={(opt) => setSelectedLoader(opt)}
                theme={theme}
              />
            </div>
          </div>
        )}

        {/* Environment Filter: Modrinth only */}
        {provider === "modrinth" && (category === "mods" || category === "modpack") && (
          <div className="flex flex-col gap-1.5">
            <label
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: theme.mutedForeground }}
            >
              <Icon name="globe" size={12} color={theme.mutedForeground} />
              Environment
            </label>
            <div className="w-full">
              <Dropdown
                value={environment}
                options={environmentOptions}
                render={(opt) =>
                  opt === "all"
                    ? "Client & Server"
                    : opt === "client"
                      ? "Client Only"
                      : "Server Only"
                }
                onChange={(opt) => setEnvironment(opt)}
                theme={theme}
              />
            </div>
          </div>
        )}
      </aside>

      {/* Quick Install Dialog */}
      {installingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-border p-5 shadow-2xl flex flex-col gap-4"
            style={{ background: theme.card }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: theme.foreground }}>
                Install {installingProject.title}
              </h2>
              <button
                type="button"
                onClick={() => setInstallingProject(null)}
                className="text-xs p-1 rounded cursor-pointer"
                style={{ color: theme.mutedForeground }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs" style={{ color: theme.mutedForeground }}>
              Choose which instance to install this {installingProject.projectType} into:
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
                onClick={() => setInstallingProject(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border cursor-pointer"
                style={{ color: theme.foreground }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={instances.length === 0 || isInstalling}
                onClick={handleInstallFile}
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
    </main>
  );
}
