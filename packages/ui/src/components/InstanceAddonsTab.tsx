import { toast } from "sonner";
interface InstallLoaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
  theme: Theme;
  onInstalled: (updatedInstance: Instance) => Promise<void>;
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

    invoke<Instance>("install_mod_loader", {
      instanceId: instance.id,
      loader: selectedLoader,
      loaderVersion: ver,
    })
      .then(async (updatedInstance) => {
        if (updatedInstance) {
          await onInstalled(updatedInstance);
          recordDownloadHistory({
            title: `${ldrName} Loader ${ver}`,
            instanceName: updatedInstance.name,
            instanceIcon: updatedInstance.icon,
            mcVersion: updatedInstance.mcVersion,
            status: "completed",
            type: "loader",
          });
        }
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
            className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={installing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-7.5 px-3 rounded-md border-0 text-xs font-semibold cursor-pointer transition-[opacity,filter] hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed select-none"
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

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { Dropdown } from "./Dropdown";
import { DiscoveryDetailsPage } from "./DiscoveryDetailsPage";
import { DiscoveryProviderToggle, type DiscoveryProvider } from "./DiscoveryProviderToggle";
import { DiscoveryPagination } from "./DiscoveryPagination";
import { DiscoveryProjectCard } from "./DiscoveryProjectCard";
import { Modal } from "./ui/modal";
import { SelectVersionModal } from "./SelectVersionModal";
import { Badge } from "./ui/badge";
import { recordDownloadHistory } from "../downloads";
import { fade, pageFade } from "../motion";
import type { Theme } from "../theme";
import type {
  DiscoveryProject,
  DiscoveryVersion,
  DiscoverySearchResponse,
  Instance,
  LoaderVersionInfo,
  MinecraftVersion,
  InstalledAddonItem,
  AddonUpdateInfo,
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  // View mode: default to installed list for mods (and can switch to discovery)
  const [viewMode, setViewMode] = useState<"installed" | "discovery">(() =>
    category === "mods" ? "installed" : "installed",
  );

  // Installed addons list state
  const [installedAddons, setInstalledAddons] = useState<InstalledAddonItem[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [installedSearch, setInstalledSearch] = useState("");
  const [updates, setUpdates] = useState<AddonUpdateInfo[]>([]);

  const checkForUpdates = useCallback(() => {
    invoke<AddonUpdateInfo[]>("check_addon_updates", {
      instanceId: instance.id,
      projectType: category,
    })
      .then((res) => {
        setUpdates(res || []);
      })
      .catch(() => {
        setUpdates([]);
      });
  }, [instance.id, category]);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);
  const [deleteConfirmAddon, setDeleteConfirmAddon] = useState<InstalledAddonItem | null>(null);
  const [versionSelectProject, setVersionSelectProject] = useState<DiscoveryProject | null>(null);

  const refreshInstalledAddons = useCallback(() => {
    setLoadingInstalled(true);
    invoke<InstalledAddonItem[]>("get_installed_addons_list", {
      instanceId: instance.id,
      projectType: category,
    })
      .then((items) => {
        const list = items || [];
        setInstalledAddons(list);
        const nextIds = new Set<string>();
        for (const item of list) {
          nextIds.add(item.id.toLowerCase());
          nextIds.add(item.fileName.toLowerCase());
          nextIds.add(item.name.toLowerCase());
          if (item.projectId) nextIds.add(item.projectId.toLowerCase());
          if (item.modId) nextIds.add(item.modId.toLowerCase());
          const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          if (slug) nextIds.add(slug);
          const clean = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (clean) nextIds.add(clean);
        }
        setInstalledIds(nextIds);
        setLoadingInstalled(false);
      })
      .catch(() => {
        setLoadingInstalled(false);
      });
  }, [instance.id, category]);

  useEffect(() => {
    let active = true;
    invoke<InstalledAddonItem[]>("get_installed_addons_list", {
      instanceId: instance.id,
      projectType: category,
    })
      .then((items) => {
        if (!active) return;
        const list = items || [];
        setInstalledAddons(list);
        const nextIds = new Set<string>();
        for (const item of list) {
          nextIds.add(item.id.toLowerCase());
          nextIds.add(item.fileName.toLowerCase());
          nextIds.add(item.name.toLowerCase());
          if (item.projectId) nextIds.add(item.projectId.toLowerCase());
          if (item.modId) nextIds.add(item.modId.toLowerCase());
          const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          if (slug) nextIds.add(slug);
          const clean = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (clean) nextIds.add(clean);
        }
        setInstalledIds(nextIds);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [instance.id, category]);

  const handleToggleAddon = async (item: InstalledAddonItem) => {
    try {
      await invoke("toggle_addon_enabled", {
        instanceId: instance.id,
        projectType: category,
        fileName: item.fileName,
        enabled: !item.enabled,
      });
      toast.success(item.enabled ? `Disabled ${item.name}` : `Enabled ${item.name}`);
      refreshInstalledAddons();
    } catch (err) {
      toast.error(`Failed to update ${item.name}: ${err}`);
    }
  };

  const handleDeleteAddon = async (item: InstalledAddonItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await invoke("delete_addon", {
        instanceId: instance.id,
        projectType: category,
        fileName: item.fileName,
      });
      toast.success(`Removed ${item.name}`);
      refreshInstalledAddons();
      checkForUpdates();
    } catch (err) {
      toast.error(`Failed to delete ${item.name}: ${err}`);
    }
  };

  const filteredInstalled = useMemo(() => {
    const q = installedSearch.trim().toLowerCase();
    if (!q) return installedAddons;
    return installedAddons.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)),
    );
  }, [installedAddons, installedSearch]);

  // Drilldown detail page state
  const [selectedProject, setSelectedProject] = useState<DiscoveryProject | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  const isVanilla =
    category === "mods" &&
    (!instance.loader ||
      instance.loader.toLowerCase() === "vanilla" ||
      instance.loader.toLowerCase() === "none");

  const handleLoaderInstalled = async (updatedInstance: Instance) => {
    if (updatedInstance.loader) {
      setSelectedLoader(updatedInstance.loader);
    }
    if (onUpdate) {
      await onUpdate(updatedInstance);
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

  const isAddonInstalled = (proj: DiscoveryProject) => {
    const idLower = proj.id.toLowerCase();
    const slugLower = proj.slug?.toLowerCase();
    const titleSlug = proj.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const titleClean = proj.title?.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      installedIds.has(idLower) ||
      Boolean(slugLower && installedIds.has(slugLower)) ||
      Boolean(titleSlug && installedIds.has(titleSlug)) ||
      Boolean(titleClean && installedIds.has(titleClean))
    );
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

  const handleInstallAddon = async (item: DiscoveryProject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      installedIds.has(item.id.toLowerCase()) ||
      Boolean(item.slug && installedIds.has(item.slug.toLowerCase()))
    ) {
      return;
    }

    if (e.shiftKey) {
      setVersionSelectProject(item);
      return;
    }
    setInstallingIds((prev) => new Set(prev).add(item.id));

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
            category === "mods" &&
            instance.loader &&
            instance.loader !== "vanilla" &&
            instance.loader !== "none"
              ? instance.loader
              : null,
        });

        let compatible =
          fetchedVersions.find((v) => v.versionType.toLowerCase() === "release") ||
          fetchedVersions[0];

        // Fallback for resource packs & shaders if strict MC version tag yielded no files
        if (!compatible && category !== "mods") {
          const anyVersions = await invoke<DiscoveryVersion[]>("get_discovery_project_versions", {
            provider: item.source,
            projectId: item.id,
            mcVersion: null,
            loader: null,
          });
          compatible =
            anyVersions.find((v) => v.versionType.toLowerCase() === "release") || anyVersions[0];
        }

        if (!compatible || !compatible.downloadUrl) {
          toast.error(`No compatible version found for Minecraft ${instance.mcVersion}`, {
            description: "Opening details page to view available versions.",
          });
          handleOpenProjectDetails(item);
          setInstallingIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
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

      refreshInstalledAddons();
      setInstalledIds((prev) => {
        const next = new Set(prev);
        next.add(item.id.toLowerCase());
        if (item.slug) next.add(item.slug.toLowerCase());
        if (fileName) {
          const stem = fileName.replace(/\.[^/.]+$/, "").toLowerCase();
          next.add(stem);
          next.add(fileName.toLowerCase());
        }
        if (installed) {
          for (const f of installed) {
            next.add(f.toLowerCase());
            next.add(f.replace(/\.[^/.]+$/, "").toLowerCase());
          }
        }
        return next;
      });
      const addonType =
        category === "mods" ? "mod" : category === "resourcepack" ? "resourcepack" : "shader";

      recordDownloadHistory({
        title: item.title,
        instanceName: instance.name,
        instanceIcon: instance.icon,
        mcVersion: instance.mcVersion,
        status: "completed",
        type: addonType,
        iconUrl: item.iconUrl,
      });

      if (installed && installed.length > 1) {
        toast.success(
          `Installed ${item.title} and ${installed.length - 1} required dependencies!`,
          {
            description: installed.slice(1).join(", "),
          },
        );
      } else {
        const folderName =
          category === "mods"
            ? "mods"
            : category === "resourcepack"
              ? "resourcepacks"
              : "shaderpacks";
        toast.success(`Installed ${item.title}!`, {
          description: `Saved to instance ${folderName} directory.`,
        });
      }
    } catch (err) {
      toast.error(`Failed to install ${item.title}`, {
        description: String(err),
      });
      handleOpenProjectDetails(item);
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
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
            targetInstanceId={instance.id}
            targetInstanceName={instance.name}
            isInstalled={isAddonInstalled(selectedProject)}
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
          ) : viewMode === "installed" ? (
            <>
              {/* INSTALLED ADDONS VIEW */}
              {/* Top Controls: Row 1 has count on the left, and Open Folder & Install Button on the right */}
              <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                  <span className="font-semibold" style={{ color: theme.foreground }}>
                    {filteredInstalled.length} {categoryLabel} installed
                  </span>
                  {filteredInstalled.some((i) => !i.enabled) && (
                    <span>({filteredInstalled.filter((i) => i.enabled).length} active)</span>
                  )}
                </div>

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
                    onClick={() => setViewMode("discovery")}
                    className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-bold cursor-pointer shadow-sm transition-all hover:brightness-110 active:scale-98 select-none"
                    style={{ background: theme.primary, color: theme.primaryForeground }}
                  >
                    <Icon name="download" size={13} color="currentColor" />
                    <span>
                      Install {category === "mods" ? "Mods" : capitalizeFirst(categoryLabel)}
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Full-width Search Input Bar */}
              <div
                className="w-full h-[38px] flex items-center gap-2 px-3 rounded-lg border border-border"
                style={{ background: theme.secondary }}
              >
                <Icon name="search" size={14} color={theme.mutedForeground} />
                <input
                  type="text"
                  placeholder={`Search installed ${categoryLabel}...`}
                  value={installedSearch}
                  onChange={(e) => setInstalledSearch(e.target.value)}
                  className="w-full text-xs bg-transparent outline-none border-none h-full placeholder:text-muted-foreground"
                  style={{ color: theme.foreground }}
                />
                {installedSearch && (
                  <button
                    type="button"
                    onClick={() => setInstalledSearch("")}
                    className="size-5 rounded flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="x" size={12} color="currentColor" />
                  </button>
                )}
              </div>

              {/* Installed List */}
              <div className="flex-1 overflow-y-auto pr-1">
                {loadingInstalled ? (
                  <div className="flex flex-col gap-2.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-16 rounded-xl border border-border animate-pulse"
                        style={{ background: theme.card }}
                      />
                    ))}
                  </div>
                ) : filteredInstalled.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center h-64 rounded-xl border border-border text-center p-6 gap-3"
                    style={{ background: theme.card }}
                  >
                    <Icon
                      name={
                        category === "mods"
                          ? "puzzle"
                          : category === "resourcepack"
                            ? "palette"
                            : "wand"
                      }
                      size={32}
                      color={theme.mutedForeground}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold" style={{ color: theme.foreground }}>
                        {installedSearch
                          ? `No ${categoryLabel} matching "${installedSearch}"`
                          : `No ${categoryLabel} installed yet`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {installedSearch
                          ? "Try a different search keyword"
                          : `Browse and download ${categoryLabel} from Modrinth and CurseForge`}
                      </span>
                    </div>
                    {!installedSearch && (
                      <button
                        type="button"
                        onClick={() => setViewMode("discovery")}
                        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all hover:brightness-110 select-none mt-1"
                        style={{ background: theme.primary, color: theme.primaryForeground }}
                      >
                        <Icon name="download" size={13} color="currentColor" />
                        <span>
                          Browse & Install{" "}
                          {category === "mods" ? "Mods" : capitalizeFirst(categoryLabel)}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 pb-2">
                    {filteredInstalled.map((item) => (
                      <div
                        key={item.fileName}
                        className="flex items-start justify-between p-3 rounded-xl border border-border gap-3.5 transition-all select-none"
                        style={{
                          background: theme.card,
                          opacity: item.enabled ? 1 : 0.65,
                        }}
                      >
                        {/* Left: Thumbnail & Content matching Discovery Card */}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {item.iconUrl ? (
                            <img
                              src={item.iconUrl}
                              alt=""
                              className="w-[72px] h-[72px] rounded-xl object-cover flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-[72px] h-[72px] rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: theme.secondary }}
                            >
                              <Icon
                                name={
                                  category === "mods"
                                    ? "puzzle"
                                    : category === "resourcepack"
                                      ? "palette"
                                      : "wand"
                                }
                                size={26}
                                color={item.enabled ? theme.primary : theme.mutedForeground}
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 h-[72px] flex flex-col justify-between">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <h3
                                  className="text-sm font-semibold truncate leading-tight"
                                  style={{ color: theme.foreground }}
                                  title={item.name}
                                >
                                  {item.name}
                                </h3>
                                <span
                                  className="text-xs font-mono truncate max-w-[160px] leading-tight shrink-0"
                                  style={{ color: theme.mutedForeground }}
                                  title={item.fileName}
                                >
                                  {item.fileName}
                                </span>
                              </div>

                              {item.description ? (
                                <p
                                  className="text-xs line-clamp-2 mt-1 leading-snug overflow-hidden"
                                  style={{ color: theme.mutedForeground }}
                                >
                                  {item.description}
                                </p>
                              ) : (
                                <p className="text-xs mt-1 leading-snug text-muted-foreground truncate">
                                  Installed in {category === "mods" ? "mods" : categoryLabel} folder
                                </p>
                              )}
                            </div>

                            {/* Badges flush with bottom of 72px thumbnail */}
                            <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                              {item.version && <Badge variant="environment">v{item.version}</Badge>}
                              <Badge variant="environment">{formatBytes(item.sizeBytes)}</Badge>
                              {item.source && (
                                <Badge variant="environment">{capitalizeFirst(item.source)}</Badge>
                              )}
                              {!item.enabled && <Badge variant="environment">Disabled</Badge>}
                              {updates.find((u) => u.fileName === item.fileName) && (
                                <Badge
                                  variant="environment"
                                  className="font-semibold"
                                  style={{ color: theme.primary }}
                                >
                                  Update available: v
                                  {updates.find((u) => u.fileName === item.fileName)?.latestVersion}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Toggle Switch & Delete Action vertically centered */}
                        <div className="h-[72px] flex items-center gap-2.5 shrink-0 pl-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAddon(item)}
                            className={`h-5 w-9 rounded-full transition-colors relative cursor-pointer border-0 ${
                              item.enabled ? "bg-primary" : "bg-muted"
                            }`}
                            title={item.enabled ? "Disable this addon" : "Enable this addon"}
                          >
                            <span
                              className={`block size-3.5 rounded-full bg-white shadow-xs transition-transform absolute top-[3px] ${
                                item.enabled ? "left-[19px]" : "left-[3px]"
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmAddon(item);
                            }}
                            className="size-8 rounded-lg flex items-center justify-center cursor-pointer border-0 bg-transparent text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Delete addon file"
                          >
                            <Icon name="trash" size={14} color="currentColor" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* DISCOVERY BROWSER VIEW */}
              {/* Top Header Row above Search: Back to Installed button + Provider switcher on the LEFT, Action & Settings trigger on the RIGHT */}
              <div className="flex items-center justify-between w-full flex-wrap gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode("installed")}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
                    style={{ color: theme.foreground }}
                    title="Return to installed list"
                  >
                    <Icon name="arrowLeft" size={13} color="currentColor" />
                    <span>Installed ({installedAddons.length})</span>
                  </button>

                  <DiscoveryProviderToggle
                    provider={provider}
                    onChange={(p) => {
                      setProvider(p);
                      setPage(1);
                    }}
                    theme={theme}
                  />
                </div>

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
                updatesAvailable={updates.length}
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
                        isInstalling={installingIds.has(item.id)}
                        isInstalled={isAddonInstalled(item)}
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

                      {/* Environment Filter (Mods on Modrinth only) */}
                      {category === "mods" && provider === "modrinth" && (
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

          {versionSelectProject && (
            <SelectVersionModal
              isOpen={true}
              onClose={() => setVersionSelectProject(null)}
              project={versionSelectProject}
              targetInstanceId={instance.id}
              targetInstanceName={instance.name}
              mcVersion={instance.mcVersion}
              loader={category === "mods" ? instance.loader : null}
              theme={theme}
              onInstallStart={(id) => {
                setInstallingIds((prev) => new Set(prev).add(id));
              }}
              onInstallError={(id) => {
                setInstallingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
              }}
              onInstalled={(installedFiles) => {
                setInstallingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(versionSelectProject.id);
                  return next;
                });
                refreshInstalledAddons();
                setInstalledIds((prev) => {
                  const next = new Set(prev);
                  if (versionSelectProject.id) next.add(versionSelectProject.id.toLowerCase());
                  if (versionSelectProject.slug) next.add(versionSelectProject.slug.toLowerCase());
                  const tSlug = versionSelectProject.title
                    ?.toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-");
                  if (tSlug) next.add(tSlug);
                  const tClean = versionSelectProject.title
                    ?.toLowerCase()
                    .replace(/[^a-z0-9]/g, "");
                  if (tClean) next.add(tClean);
                  for (const f of installedFiles) {
                    next.add(f.toLowerCase());
                    next.add(f.replace(/\.[^/.]+$/, "").toLowerCase());
                  }
                  return next;
                });
              }}
            />
          )}

          {deleteConfirmAddon && (
            <Modal
              isOpen={true}
              onClose={() => setDeleteConfirmAddon(null)}
              theme={theme}
              title={
                <span className="text-red-500 font-bold">
                  Delete {category === "mods" ? "Mod" : capitalizeFirst(categoryLabel)}
                </span>
              }
              maxWidth={420}
              footer={
                <>
                  <button
                    type="button"
                    className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors duration-120 hover:bg-foreground/5 select-none"
                    style={{ color: theme.mutedForeground }}
                    onClick={() => setDeleteConfirmAddon(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 h-7.5 px-3 rounded-md border-0 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold cursor-pointer transition-all hover:brightness-108 select-none"
                    onClick={async () => {
                      const target = deleteConfirmAddon;
                      setDeleteConfirmAddon(null);
                      await handleDeleteAddon(target);
                    }}
                  >
                    Delete Permanently
                  </button>
                </>
              }
            >
              <p className="text-xs leading-relaxed m-0" style={{ color: theme.mutedForeground }}>
                Are you sure you want to remove{" "}
                <strong style={{ color: theme.foreground }}>{deleteConfirmAddon.name}</strong> (
                {deleteConfirmAddon.fileName})? This file will be permanently deleted from this
                instance.
              </p>
            </Modal>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
