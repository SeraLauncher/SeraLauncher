import { toast } from "sonner";
interface InstallLoaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
  theme: Theme;
  onInstalled: (loader: string, loaderVersion: string) => Promise<void>;
}

const SUPPORTED_LOADERS = [
  { id: "fabric", name: "Fabric", desc: "Lightweight, highly modular, and fast loader" },
  { id: "neoforge", name: "NeoForge", desc: "Modern community-driven fork of Minecraft Forge" },
  { id: "forge", name: "Forge", desc: "Traditional loader with a massive mod ecosystem" },
  { id: "quilt", name: "Quilt", desc: "Caring, modular loader compatible with most Fabric mods" },
] as const;

function InstallLoaderModal({
  isOpen,
  onClose,
  instance,
  theme,
  onInstalled,
}: InstallLoaderModalProps) {
  const [selectedLoader, setSelectedLoader] = useState<"fabric" | "neoforge" | "forge" | "quilt">(
    "fabric",
  );
  const [versions, setVersions] = useState<LoaderVersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const timer = setTimeout(() => {
      setLoadingVersions(true);
      invoke<LoaderVersionInfo[]>("get_mod_loader_versions", {
        mcVersion: instance.mcVersion,
        loader: selectedLoader,
      })
        .then((res) => {
          if (!active) return;
          const list = res || [];
          setVersions(list);
          if (list.length > 0) {
            setSelectedVersion(list[0].version);
          } else {
            setSelectedVersion("latest");
          }
          setLoadingVersions(false);
        })
        .catch(() => {
          if (!active) return;
          setVersions([{ version: "latest", stable: true }]);
          setSelectedVersion("latest");
          setLoadingVersions(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, selectedLoader, instance.mcVersion]);

  const handleInstall = () => {
    if (!selectedVersion) return;
    const ldrName = selectedLoader.charAt(0).toUpperCase() + selectedLoader.slice(1);
    const ver = selectedVersion;
    onClose();

    toast.info(`Installing ${ldrName} Loader ${ver}...`, {
      description: "Download started in the header.",
    });

    invoke("install_mod_loader", {
      instanceId: instance.id,
      loader: selectedLoader,
      loaderVersion: ver,
    })
      .then(async () => {
        await onInstalled(selectedLoader, ver);
        toast.success(`${ldrName} Loader installed successfully!`, {
          description: "Mods folder created and ready.",
        });
      })
      .catch((err) => {
        toast.error(`Failed to install ${ldrName} Loader`, {
          description: String(err),
        });
      });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title="Install Mod Loader"
      maxWidth={500}
      contentClassName="relative z-10 p-4.5 flex flex-col gap-3.5 overflow-visible"
      footer={
        <>
          <button
            type="button"
            className="h-8 px-3.5 rounded-md border-0 bg-transparent text-[0.82rem] font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={installing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md border-0 text-[0.82rem] font-semibold cursor-pointer transition-[opacity,filter] hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed select-none"
            style={{ background: theme.primary, color: theme.primaryForeground }}
            onClick={handleInstall}
            disabled={installing || loadingVersions}
          >
            {installing
              ? "Installing..."
              : `Install ${selectedLoader.charAt(0).toUpperCase() + selectedLoader.slice(1)}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: theme.foreground }}>
            Select Mod Loader for {instance.name} (Minecraft {instance.mcVersion})
          </span>
          <span className="text-[11px] text-muted-foreground">
            Installing a mod loader enables compatibility with mods and automatically initializes
            the mods folder.
          </span>
        </div>

        {/* Loader Cards Grid */}
        <div className="grid grid-cols-2 gap-2">
          {SUPPORTED_LOADERS.map((ldr) => {
            const isSelected = selectedLoader === ldr.id;
            return (
              <button
                key={ldr.id}
                type="button"
                onClick={() => setSelectedLoader(ldr.id)}
                className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer select-none ${isSelected ? "border-primary bg-card shadow-xs" : "border-border bg-secondary hover:border-border/80"}`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className="text-xs font-bold"
                    style={{ color: isSelected ? theme.primary : theme.foreground }}
                  >
                    {ldr.name}
                  </span>
                  {isSelected && <div className="size-2 rounded-full bg-primary" />}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                  {ldr.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loader Version Selector */}
        <div className="flex flex-col gap-1.5 pt-1 relative z-20">
          <label className="text-xs font-semibold" style={{ color: theme.foreground }}>
            Loader Version
          </label>
          {loadingVersions ? (
            <div className="h-9 px-3 flex items-center rounded-lg border border-border bg-secondary text-xs text-muted-foreground">
              Fetching available versions for {instance.mcVersion}...
            </div>
          ) : (
            <Dropdown
              value={selectedVersion}
              options={versions.map((v) => v.version)}
              render={(ver) => {
                const info = versions.find((v) => v.version === ver);
                if (info?.stable) {
                  return `${ver} (Stable)`;
                }
                return ver;
              }}
              onChange={(v) => setSelectedVersion(v)}
              theme={theme}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { Dropdown } from "./Dropdown";
import { DiscoveryDetailsPage } from "./DiscoveryDetailsPage";
import { DiscoveryProviderToggle, type DiscoveryProvider } from "./DiscoveryProviderToggle";
import { DiscoveryPagination } from "./DiscoveryPagination";
import { DiscoveryProjectCard } from "./DiscoveryProjectCard";
import { Modal } from "./ui/modal";
import { fade, pageFade } from "../motion";
import type { Theme } from "../theme";
import type {
  DiscoveryProject,
  DiscoveryVersion,
  DiscoverySearchResponse,
  Instance,
  LoaderVersionInfo,
  MinecraftVersion,
} from "../instance";

import type { EnvironmentFilter } from "./DiscoveryPage";

interface InstanceAddonsTabProps {
  theme: Theme;
  instance: Instance;
  instances: Instance[];
  versions: MinecraftVersion[];
  category: "mods" | "resourcepack" | "shader";
  onOpenFolder: () => Promise<void>;
  onUpdate?: (updated: Instance) => Promise<void>;
}

function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// In-memory cache to make provider and filter switches instantaneous
const addonsSearchClientCache = new Map<
  string,
  { projects: DiscoveryProject[]; totalHits: number; timestamp: number }
>();
const CLIENT_CACHE_TTL_MS = 180000; // 3 minutes

export function InstanceAddonsTab({
  theme,
  instance,
  instances,
  versions,
  category,
  onOpenFolder,
  onUpdate,
}: InstanceAddonsTabProps) {
  const [showInstallLoaderModal, setShowInstallLoaderModal] = useState(false);
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

  // Quick install state
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  // Drilldown detail page state
  const [selectedProject, setSelectedProject] = useState<DiscoveryProject | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const isVanilla =
    category === "mods" &&
    (!instance.loader ||
      instance.loader.toLowerCase() === "vanilla" ||
      instance.loader.toLowerCase() === "none");

  const handleLoaderInstalled = async (loader: string, loaderVersion: string) => {
    setSelectedLoader(loader);
    const updated = {
      ...instance,
      loader,
      loaderVersion,
    };
    if (onUpdate) {
      await onUpdate(updated);
    }
  };

  const prevSearchRef = useRef(search);

  const categoryLabel =
    category === "mods" ? "mods" : category === "resourcepack" ? "resource packs" : "shaders";

  const folderButtonLabel =
    category === "mods"
      ? "Open Mods Folder"
      : category === "resourcepack"
        ? "Open Resource Packs Folder"
        : "Open Shaderpacks Folder";

  useEffect(() => {
    let active = true;
    const isTextSearchChange = prevSearchRef.current !== search;
    prevSearchRef.current = search;

    const debounceMs = isTextSearchChange ? 300 : 0;
    const cacheKey = `${provider}:${category}:${search.trim()}:${selectedVersion}:${category === "mods" ? selectedLoader : "none"}:${environment}:${sort}:${page}`;
    const cached = addonsSearchClientCache.get(cacheKey);

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
        projectType: category,
        query: search.trim() || null,
        mcVersion: selectedVersion === "all" ? null : selectedVersion,
        loader: category === "mods" && selectedLoader !== "all" ? selectedLoader : null,
        environment: provider === "modrinth" && environment !== "all" ? environment : null,
        sort,
        offset: (page - 1) * limit,
        limit,
      })
        .then((res) => {
          if (!active) return;
          const projs = res.projects || [];
          const hits = res.totalHits || 0;
          addonsSearchClientCache.set(cacheKey, {
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

  const handleInstallAddon = async (item: DiscoveryProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setInstallingId(item.id);

    try {
      let downloadUrl = item.downloadUrl || "";
      let fileName = "";

      // Resolve actual file version for this instance
      if (!downloadUrl) {
        toast.info(`Resolving compatible version for ${item.title}...`);
        const fetchedVersions = await invoke<DiscoveryVersion[]>("get_discovery_project_versions", {
          provider: item.source,
          projectId: item.id,
          mcVersion: instance.mcVersion,
          loader:
            instance.loader && instance.loader !== "vanilla" && instance.loader !== "none"
              ? instance.loader
              : null,
        });

        const compatible =
          fetchedVersions.find((v) => v.versionType.toLowerCase() === "release") ||
          fetchedVersions[0];

        if (!compatible || !compatible.downloadUrl) {
          toast.error(`No compatible version found for Minecraft ${instance.mcVersion}`, {
            description: "Opening details page to view available versions.",
          });
          handleOpenProjectDetails(item);
          setInstallingId(null);
          return;
        }

        downloadUrl = compatible.downloadUrl;
        fileName = compatible.fileName;
      }

      if (!fileName) {
        const ext = category === "mods" ? ".jar" : ".zip";
        fileName = `${item.slug || category}${ext}`;
      }

      toast.info(`Downloading ${item.title}...`, {
        description: "Check the header for download progress.",
      });

      const installed = await invoke<string[]>("install_discovery_project", {
        instanceId: instance.id,
        projectType: category,
        downloadUrl,
        fileName,
        provider: item.source,
        projectId: item.id,
        versionId: null,
      });

      setInstalledIds((prev) => new Set(prev).add(item.id));
      if (installed && installed.length > 1) {
        toast.success(
          `Installed ${item.title} and ${installed.length - 1} required dependencies!`,
          {
            description: installed.slice(1).join(", "),
          },
        );
      } else {
        toast.success(`Installed ${item.title}!`, {
          description: `Saved to instance ${category} directory.`,
        });
      }
    } catch (err) {
      toast.error(`Failed to install ${item.title}`, {
        description: String(err),
      });
      handleOpenProjectDetails(item);
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {selectedProject ? (
        <motion.div
          key={`addon-detail-${selectedProject.source}-${selectedProject.id}`}
          {...pageFade}
          transition={fade}
          className="flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden"
        >
          <DiscoveryDetailsPage
            key={`${selectedProject.source}:${selectedProject.id}`}
            theme={theme}
            project={selectedProject}
            instances={instances}
            versions={versions}
            onBack={handleBackFromDetails}
          />
        </motion.div>
      ) : (
        <motion.div
          key={`addon-list-${category}`}
          {...pageFade}
          transition={fade}
          className="relative flex-1 flex flex-col gap-3.5 w-full h-full min-h-full overflow-hidden p-6 pr-5"
        >
          {isVanilla ? (
            <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center p-4 select-none">
              <div
                className="flex flex-col items-center justify-center text-center p-7 gap-4 border border-border rounded-2xl shadow-sm max-w-[420px] w-full"
                style={{ background: theme.card }}
              >
                <div
                  className="size-14 rounded-2xl flex items-center justify-center border border-border"
                  style={{ background: theme.secondary }}
                >
                  <Icon name="puzzle" size={28} color={theme.primary} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-bold m-0" style={{ color: theme.foreground }}>
                    No Mod Loader Installed
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-xs m-0">
                    This instance is running Vanilla Minecraft {instance.mcVersion}. To install and
                    run mods, install a mod loader like Fabric, Forge, NeoForge, or Quilt.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInstallLoaderModal(true)}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-all hover:brightness-110 active:scale-95"
                  style={{ background: theme.primary, color: theme.primaryForeground }}
                >
                  <Icon name="download" size={14} color="currentColor" />
                  <span>Install Mod Loader</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Header Row above Search: Provider switcher on the LEFT, Action & Settings trigger on the RIGHT */}
              <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
                <DiscoveryProviderToggle
                  provider={provider}
                  onChange={(p) => {
                    setProvider(p);
                    setPage(1);
                  }}
                  theme={theme}
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none"
                    onClick={onOpenFolder}
                    title={`Open instance ${categoryLabel} directory`}
                  >
                    <Icon name="folder" size={14} color="currentColor" />
                    <span>{folderButtonLabel}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchSettingsOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-semibold cursor-pointer transition-colors select-none"
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
                  placeholder={`Search ${categoryLabel}...`}
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
              <DiscoveryPagination
                page={page}
                totalHits={totalHits}
                limit={limit}
                loading={loading}
                itemLabel={categoryLabel}
                theme={theme}
                onPageChange={setPage}
                onScrollToTop={() =>
                  scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                }
              />

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
                      No {categoryLabel} found
                    </span>
                    <span className="text-xs mt-1" style={{ color: theme.mutedForeground }}>
                      Try adjusting your search query or filters in Search Settings
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 pb-2">
                    {projects.map((item) => (
                      <DiscoveryProjectCard
                        key={`${item.source}-${item.id}`}
                        item={item}
                        theme={theme}
                        onClick={() => handleOpenProjectDetails(item)}
                        onInstall={(e) => handleInstallAddon(item, e)}
                        isInstalling={installingId === item.id}
                        isInstalled={installedIds.has(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Floating SEARCH SETTINGS Drawer (Scoped below header, inside tab only) */}
              <AnimatePresence>
                {searchSettingsOpen && (
                  <>
                    {/* Backdrop contained within tab content below header */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 bg-black/45 z-20 backdrop-blur-2xs"
                      onClick={() => setSearchSettingsOpen(false)}
                    />

                    {/* Sliding Drawer Panel contained below header */}
                    <motion.aside
                      initial={{ x: "100%", opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: "100%", opacity: 0 }}
                      transition={{ type: "spring", stiffness: 350, damping: 32 }}
                      className="absolute top-0 bottom-0 right-0 w-64 z-30 shadow-2xl border-l border-border p-4.5 flex flex-col gap-4.5 overflow-y-auto"
                      style={{ background: theme.sidebar }}
                    >
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

                      {/* Mod Loader Filter (Only applicable for Mods) */}
                      {category === "mods" && (
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
                              render={(opt) =>
                                opt === "all" ? "All Loaders" : capitalizeFirst(opt)
                              }
                              onChange={(opt) => {
                                setSelectedLoader(opt);
                                setPage(1);
                              }}
                              theme={theme}
                            />
                          </div>
                        </div>
                      )}

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
            </>
          )}

          <InstallLoaderModal
            isOpen={showInstallLoaderModal}
            onClose={() => setShowInstallLoaderModal(false)}
            instance={instance}
            theme={theme}
            onInstalled={handleLoaderInstalled}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
