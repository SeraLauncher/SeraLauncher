import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { Icon, SiCurseforge, SiModrinth } from "./Icon";
import { Dropdown } from "./Dropdown";
import { Badge } from "./ui/badge";
import { DiscoveryDetailsPage } from "./DiscoveryDetailsPage";
import type { DiscoveryProvider, EnvironmentFilter } from "./DiscoveryPage";
import type { Theme } from "../theme";
import type {
  DiscoveryProject,
  DiscoverySearchResponse,
  Instance,
  MinecraftVersion,
} from "../instance";

interface InstanceModsTabProps {
  theme: Theme;
  instance: Instance;
  instances: Instance[];
  versions: MinecraftVersion[];
  onOpenFolder: () => Promise<void>;
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
const modsSearchClientCache = new Map<
  string,
  { projects: DiscoveryProject[]; totalHits: number; timestamp: number }
>();
const CLIENT_CACHE_TTL_MS = 180000; // 3 minutes

export function InstanceModsTab({
  theme,
  instance,
  instances,
  versions,
  onOpenFolder,
}: InstanceModsTabProps) {
  const [provider, setProvider] = useState<DiscoveryProvider>("modrinth");
  const [search, setSearch] = useState("");

  // Automatically initialize Game Version based on instance
  const [selectedVersion, setSelectedVersion] = useState<string>(() => instance.mcVersion || "all");

  // Automatically initialize Mod Loader based on instance (defaults to "all" if vanilla/not installed)
  const [selectedLoader, setSelectedLoader] = useState<string>(() => {
    const loader = instance.loader?.toLowerCase();
    if (loader && loader !== "vanilla" && loader !== "none") {
      return loader;
    }
    return "all";
  });

  const [environment, setEnvironment] = useState<EnvironmentFilter>("all");
  const [sort, setSort] = useState<"relevance" | "downloads" | "updated" | "newest">("relevance");

  const [page, setPage] = useState(1);
  const limit = 25;

  const [searchSettingsOpen, setSearchSettingsOpen] = useState(false);

  // Results state
  const [projects, setProjects] = useState<DiscoveryProject[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);

  // Jump page input state
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInputVal, setPageInputVal] = useState("");

  // Quick install state
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installSuccessMessage, setInstallSuccessMessage] = useState<string | null>(null);

  // Drilldown detail page state
  const [selectedProject, setSelectedProject] = useState<DiscoveryProject | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const prevSearchRef = useRef(search);

  useEffect(() => {
    let active = true;
    const isTextSearchChange = prevSearchRef.current !== search;
    prevSearchRef.current = search;

    const debounceMs = isTextSearchChange ? 300 : 0;
    const cacheKey = `${provider}:mods:${search.trim()}:${selectedVersion}:${selectedLoader}:${environment}:${sort}:${page}`;
    const cached = modsSearchClientCache.get(cacheKey);

    const timer = setTimeout(() => {
      if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        setProjects(cached.projects);
        setTotalHits(cached.totalHits);
        setLoading(false);
        if (Date.now() - cached.timestamp < 30000) {
          return;
        }
      } else {
        setLoading(true);
      }

      invoke<DiscoverySearchResponse>("search_discovery", {
        provider,
        projectType: "mods",
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
          modsSearchClientCache.set(cacheKey, {
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
  }, [provider, search, selectedVersion, selectedLoader, environment, sort, page]);

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

  const totalPages = Math.max(1, Math.ceil(totalHits / limit));

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

  const handleOpenProjectDetails = (item: DiscoveryProject) => {
    savedScrollTopRef.current = scrollContainerRef.current?.scrollTop || 0;
    setSelectedProject(item);
  };

  const handleBackFromDetails = () => {
    setSelectedProject(null);
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
      }
    }, 0);
  };

  const handleInstallMod = async (item: DiscoveryProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setInstallingId(item.id);
    setInstallSuccessMessage(null);

    try {
      const fileName = `${item.slug || "mod"}.jar`;
      const downloadUrl =
        item.downloadUrl ||
        (provider === "modrinth" ? `https://api.modrinth.com/v2/project/${item.id}/version` : "");

      if (!downloadUrl) {
        // If direct download URL is not in search result, open details page to select version
        handleOpenProjectDetails(item);
        setInstallingId(null);
        return;
      }

      await invoke("install_discovery_project", {
        instanceId: instance.id,
        projectType: "mods",
        downloadUrl,
        fileName,
      });

      setInstalledIds((prev) => new Set(prev).add(item.id));
      setInstallSuccessMessage(`Installed ${item.title}!`);
      setTimeout(() => setInstallSuccessMessage(null), 2500);
    } catch {
      // If direct file URL install fails, open details view so user picks a specific release
      handleOpenProjectDetails(item);
    } finally {
      setInstallingId(null);
    }
  };

  if (selectedProject) {
    return (
      <DiscoveryDetailsPage
        key={`${selectedProject.source}:${selectedProject.id}`}
        theme={theme}
        project={selectedProject}
        instances={instances}
        versions={versions}
        onBack={handleBackFromDetails}
      />
    );
  }

  return (
    <div className="relative flex-1 flex flex-col gap-3.5 w-full h-full min-h-full overflow-hidden p-6 pr-5">
      {/* Top Header Row above Search: Provider switcher on the LEFT, Action & Settings trigger on the RIGHT */}
      <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
        {/* Left: Hosting Provider Switcher (Modrinth / CurseForge) */}
        <div
          className="flex p-0.5 rounded-lg border border-border gap-0.5"
          style={{ background: theme.secondary }}
        >
          <button
            type="button"
            onClick={() => {
              setProvider("modrinth");
              setPage(1);
            }}
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
            onClick={() => {
              setProvider("curseforge");
              setPage(1);
            }}
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

        {/* Right: Open Mods Folder + SEARCH SETTINGS Button */}
        <div className="flex items-center gap-2">
          {installSuccessMessage && (
            <span className="text-xs font-medium text-emerald-500 animate-in fade-in">
              {installSuccessMessage}
            </span>
          )}

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors"
            onClick={onOpenFolder}
            title="Open instance mods directory"
          >
            <Icon name="folder" size={14} color="currentColor" />
            <span>Open Folder</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchSettingsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-semibold cursor-pointer transition-colors"
            style={{
              background: searchSettingsOpen ? theme.primary : theme.secondary,
              color: searchSettingsOpen ? theme.primaryForeground : theme.foreground,
            }}
            title="Toggle search filters"
          >
            <Icon name="filter" size={13} color="currentColor" />
            <span>Search Settings</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div
        className="w-full h-[38px] flex items-center gap-2 px-3 rounded-lg border border-border"
        style={{ background: theme.secondary }}
      >
        <Icon name="search" size={14} color={theme.mutedForeground} />
        <input
          type="text"
          placeholder="Search mods..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full text-xs bg-transparent outline-none border-none h-full placeholder:text-muted-foreground"
          style={{ color: theme.foreground }}
        />
      </div>

      {/* Results Count & Pagination Controls */}
      <div
        className="flex items-center justify-between text-xs px-1"
        style={{ color: theme.mutedForeground }}
      >
        <span>
          {loading
            ? "Searching mods..."
            : totalHits === 0
              ? "No mods found"
              : `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, totalHits)} of ${totalHits.toLocaleString()} mods`}
        </span>

        {/* Numeric Jump Pagination */}
        <div className="flex items-center gap-1.5">
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
                  title="Click to enter page number"
                  onClick={() => {
                    setPageInputVal(String(page));
                    setIsEditingPage(true);
                  }}
                  className="h-7 px-1.5 flex items-center justify-center rounded-md text-xs font-semibold border border-transparent hover:border-border cursor-pointer transition-colors"
                  style={{ color: theme.mutedForeground }}
                >
                  ...
                </button>
              )}

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
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl border border-border animate-pulse"
                style={{ background: theme.card }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-64 rounded-xl border border-border text-center p-4"
            style={{ background: theme.card }}
          >
            <Icon name="search" size={28} color={theme.mutedForeground} />
            <span className="text-sm font-medium mt-3" style={{ color: theme.foreground }}>
              No mods found
            </span>
            <span className="text-xs mt-1" style={{ color: theme.mutedForeground }}>
              Try adjusting your search query or filters in Search Settings
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pb-2">
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
              const isItemInstalling = installingId === item.id;
              const isItemInstalled = installedIds.has(item.id);

              return (
                <div
                  key={`${item.source}-${item.id}`}
                  onClick={() => handleOpenProjectDetails(item)}
                  onMouseEnter={() => {
                    invoke("get_discovery_project_details", {
                      provider: item.source,
                      projectId: item.id,
                    }).catch(() => {});
                  }}
                  className="flex items-start justify-between p-3 rounded-xl border border-border gap-3.5 transition-all hover:shadow-md cursor-pointer select-none"
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
                      {/* Title and Description */}
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

                      {/* Badges flush with bottom of 72px image */}
                      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                        {item.environment === "both" && (
                          <Badge
                            variant="environment"
                            icon={<Icon name="globe" size={12} color={theme.primary} />}
                          >
                            Client & Server
                          </Badge>
                        )}
                        {item.environment === "client" && (
                          <Badge
                            variant="environment"
                            icon={<Icon name="computer" size={12} color={theme.primary} />}
                          >
                            Client
                          </Badge>
                        )}
                        {item.environment === "server" && (
                          <Badge
                            variant="environment"
                            icon={<Icon name="server" size={12} color={theme.primary} />}
                          >
                            Server
                          </Badge>
                        )}

                        {item.categories.slice(0, 4).map((cat) => (
                          <Badge key={cat} variant="environment">
                            {capitalizeFirst(cat)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Group: Install Button & Metrics */}
                  <div className="h-[72px] flex flex-col justify-between items-end flex-shrink-0 pl-2">
                    <button
                      type="button"
                      disabled={isItemInstalling}
                      onClick={(e) => handleInstallMod(item, e)}
                      className="h-[26px] px-3 text-xs font-semibold rounded-md transition-opacity hover:opacity-90 cursor-pointer flex items-center justify-center leading-none disabled:opacity-60"
                      style={{
                        background: isItemInstalled ? theme.success : theme.primary,
                        color: theme.primaryForeground,
                      }}
                    >
                      {isItemInstalling
                        ? "Installing..."
                        : isItemInstalled
                          ? "Installed"
                          : "Install"}
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

      {/* Floating SEARCH SETTINGS Drawer (Slides from Right to Left, Default Closed) */}
      <AnimatePresence>
        {searchSettingsOpen && (
          <>
            {/* Backdrop to dismiss on click outside (contained within Mods tab only) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/45 z-20 backdrop-blur-2xs"
              onClick={() => setSearchSettingsOpen(false)}
            />

            {/* Sliding Drawer Panel contained below header within Mods tab */}
            <motion.aside
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 32 }}
              className="absolute top-0 bottom-0 right-0 w-64 z-30 shadow-2xl border-l border-border p-4.5 flex flex-col gap-4.5 overflow-y-auto"
              style={{ background: theme.sidebar }}
            >
              {/* Drawer Title & Close Button */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="filter" size={14} color={theme.primary} />
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: theme.foreground }}
                  >
                    SEARCH SETTINGS
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchSettingsOpen(false)}
                  className="size-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-card transition-colors"
                  style={{ color: theme.mutedForeground }}
                  title="Close search settings"
                >
                  <Icon name="x" size={14} color="currentColor" />
                </button>
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
                    onChange={(opt) => {
                      setSort(opt);
                      setPage(1);
                    }}
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
                    onChange={(opt) => {
                      setSelectedVersion(opt);
                      setPage(1);
                    }}
                    theme={theme}
                  />
                </div>
              </div>

              {/* Mod Loader Filter */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="flex items-center gap-1.5 text-[11px] font-semibold"
                  style={{ color: theme.mutedForeground }}
                >
                  <Icon name="settings" size={12} color={theme.mutedForeground} />
                  Mod Loader
                </label>
                <div className="w-full">
                  <Dropdown
                    value={selectedLoader}
                    options={loaderOptions}
                    render={(opt) => (opt === "all" ? "All Loaders" : capitalizeFirst(opt))}
                    onChange={(opt) => {
                      setSelectedLoader(opt);
                      setPage(1);
                    }}
                    theme={theme}
                  />
                </div>
              </div>

              {/* Environment Filter (Modrinth only) */}
              {provider === "modrinth" && (
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
                      render={(opt) => {
                        if (opt === "all") return "Client & Server";
                        if (opt === "client") return "Client Only";
                        return "Server Only";
                      }}
                      onChange={(opt) => {
                        setEnvironment(opt);
                        setPage(1);
                      }}
                      theme={theme}
                    />
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
