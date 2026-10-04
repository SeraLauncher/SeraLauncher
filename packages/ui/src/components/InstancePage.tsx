import { useMemo, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { Modal } from "./ui/modal";
import type { Theme } from "../theme";
import type {
  Instance,
  MinecraftVersion,
  InstanceManagementTab,
  RunningInstanceInfo,
} from "../instance";
import { formatPlayTime } from "../instance";
import type { JavaRuntime, Settings } from "../settings";
import { DEFAULT_MIN_MEMORY, DEFAULT_MAX_MEMORY, MEMORY_PRESETS } from "../settings";
import { Dropdown } from "./Dropdown";
import { EffectiveJavaArgsModal } from "./EffectiveJavaArgsModal";
import {
  BLOCK_ICON_KEYS,
  PASTEL_GRADIENTS,
  encodeInstanceIcon,
  getBlockIconSrc,
  getPastelGradientByName,
  getPastelGradientForInstance,
  getRandomBlockIconKey,
  getRandomPastelGradientName,
  parseInstanceIcon,
} from "../blocks";

type SortOption = "lastPlayed" | "name" | "version";

export function InstancePage({
  theme,
  instances,
  versions,
  javaRuntimes,
  managingInstanceId: controlledManagingId,
  onSelectManagingInstanceId: controlledSetManagingId,
  activeManagementTab: controlledTab,
  onSelectManagementTab: controlledSetTab,
  systemMemoryMb = 8192,
  onRefreshJava,
  runningInstances = [],
  onKillInstance,
  onCreateInstance,
  onDeleteInstance,
  onUpdateInstance,
  onOpenFolder,
  onLaunch,
}: {
  theme: Theme;
  instances: Instance[];
  versions: MinecraftVersion[];
  javaRuntimes?: JavaRuntime[];
  managingInstanceId?: string | null;
  onSelectManagingInstanceId?: (id: string | null) => void;
  activeManagementTab?: InstanceManagementTab;
  onSelectManagementTab?: (tab: InstanceManagementTab) => void;
  systemMemoryMb?: number;
  onRefreshJava?: () => void;
  runningInstances?: RunningInstanceInfo[];
  onKillInstance?: (id: string) => Promise<void>;
  onCreateInstance: (
    name: string,
    mcVersion: string,
    versionType: string,
    icon?: string | null,
  ) => Promise<void>;
  onDeleteInstance: (id: string) => Promise<void>;
  onUpdateInstance: (instance: Instance) => Promise<void>;
  onOpenFolder: (id: string) => Promise<void>;
  onLaunch: (instance: Instance) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("lastPlayed");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [versionFilter, setVersionFilter] = useState<"all" | "release" | "snapshot">("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [internalManagingId, setInternalManagingId] = useState<string | null>(null);
  const [internalTab, setInternalTab] = useState<InstanceManagementTab>("overview");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const effectiveManagingId =
    controlledManagingId !== undefined ? controlledManagingId : internalManagingId;
  const setEffectiveManagingId = controlledSetManagingId ?? setInternalManagingId;
  const effectiveTab = controlledTab !== undefined ? controlledTab : internalTab;
  const setEffectiveTab = controlledSetTab ?? setInternalTab;

  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Close sort and filter menus on click outside
  useEffect(() => {
    if (!sortMenuOpen && !filterMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [sortMenuOpen, filterMenuOpen]);

  // Sort and filter instances
  const processedInstances = useMemo(() => {
    let list = [...instances];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (inst) => inst.name.toLowerCase().includes(q) || inst.mcVersion.toLowerCase().includes(q),
      );
    }
    if (versionFilter !== "all") {
      list = list.filter((inst) => inst.versionType === versionFilter);
    }

    list.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "version") {
        return b.mcVersion.localeCompare(a.mcVersion, undefined, { numeric: true });
      }
      // default: lastPlayed or recently created
      const aTime = a.lastPlayed ?? a.createdAt;
      const bTime = b.lastPlayed ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });

    return list;
  }, [instances, search, sortBy, versionFilter]);

  const sortLabels: Record<SortOption, string> = {
    lastPlayed: "Last played",
    name: "Name",
    version: "Minecraft version",
  };

  const managingInstance = useMemo(
    () => instances.find((i) => i.id === effectiveManagingId) ?? null,
    [instances, effectiveManagingId],
  );

  if (managingInstance) {
    return (
      <InstanceManagementView
        theme={theme}
        instance={managingInstance}
        activeTab={effectiveTab}
        javaRuntimes={javaRuntimes}
        systemMemoryMb={systemMemoryMb}
        onRefreshJava={onRefreshJava}
        runningInstances={runningInstances}
        onKillInstance={onKillInstance}
        onSelectTab={setEffectiveTab}
        onBack={() => setEffectiveManagingId(null)}
        onLaunch={() => onLaunch(managingInstance)}
        onOpenFolder={() => onOpenFolder(managingInstance.id)}
        onUpdate={onUpdateInstance}
        onDelete={() => setDeleteConfirmId(managingInstance.id)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 min-h-full">
      {/* Title */}
      <h1 className="text-xl font-bold tracking-tight" style={{ color: theme.foreground }}>
        Instance
      </h1>

      {/* Modern Toolbar matching reference */}
      <div className="flex flex-col gap-2.5 w-full">
        {/* Row 1: Search bar + New instance button */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex-1 h-9 flex items-center gap-2 px-3 rounded-lg border border-border bg-secondary focus-within:border-primary transition-colors [&>input]:w-full [&>input]:h-full [&>input]:bg-transparent [&>input]:border-0 [&>input]:text-xs [&>input]:text-foreground [&>input]:outline-none [&>input]:placeholder:text-muted-foreground">
            <Icon name="search" size={16} color={theme.mutedForeground} />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border-0 bg-primary text-primary-foreground text-sm font-semibold cursor-pointer transition-all hover:brightness-108 active:scale-95 shrink-0"
            onClick={() => setCreateModalOpen(true)}
          >
            <Icon name="plus" size={17} color={theme.primaryForeground} />
            <span>New instance</span>
          </button>
        </div>

        {/* Row 2: Sort dropdown + Filter dropdown */}
        <div className="flex items-center justify-between gap-2 w-full flex-wrap">
          <div className="relative inline-block" ref={sortMenuRef}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer transition-colors hover:bg-card hover:text-foreground"
              onClick={() => {
                setSortMenuOpen(!sortMenuOpen);
                setFilterMenuOpen(false);
              }}
            >
              <Icon name="sortArrows" size={14} color={theme.mutedForeground} />
              <span>{sortLabels[sortBy]}</span>
              <Icon name="chevronDown" size={14} color={theme.mutedForeground} />
            </button>

            <AnimatePresence>
              {sortMenuOpen && (
                <motion.div
                  className="absolute left-0 top-[calc(100%+4px)] min-w-[150px] p-1 rounded-lg border border-border bg-secondary shadow-xl z-30 flex flex-col gap-0.5"
                  style={{ background: theme.secondary, borderColor: theme.border }}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  {[
                    { id: "lastPlayed", label: "Last played" },
                    { id: "name", label: "Name" },
                    { id: "version", label: "Minecraft version" },
                  ].map((item) => {
                    const isSelected = sortBy === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full px-3 py-2 rounded-md border-0 text-sm font-medium text-left cursor-pointer transition-colors hover:bg-card/70"
                        style={{
                          background: isSelected ? theme.card : "transparent",
                          color: theme.foreground,
                        }}
                        onClick={() => {
                          setSortBy(item.id as any);
                          setSortMenuOpen(false);
                        }}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-px h-4 bg-border shrink-0" />

          {/* Filter dropdown */}
          <div className="relative inline-block" ref={filterMenuRef}>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer transition-colors hover:bg-card hover:text-foreground ${versionFilter !== "all" ? "bg-card text-foreground font-semibold border-primary" : ""}`}
              onClick={() => {
                setFilterMenuOpen(!filterMenuOpen);
                setSortMenuOpen(false);
              }}
            >
              <Icon
                name="filter"
                size={14}
                color={versionFilter !== "all" ? theme.primary : theme.mutedForeground}
              />
              <span>
                {versionFilter === "all"
                  ? "Add filter"
                  : versionFilter === "release"
                    ? "Releases only"
                    : "Snapshots only"}
              </span>
              <Icon name="chevronDown" size={14} color={theme.mutedForeground} />
            </button>

            <AnimatePresence>
              {filterMenuOpen && (
                <motion.div
                  className="absolute right-0 top-[calc(100%+4px)] min-w-[160px] p-1 rounded-lg border border-border bg-secondary shadow-xl z-30 flex flex-col gap-0.5"
                  style={{ background: theme.secondary, borderColor: theme.border }}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  {[
                    { id: "all", label: "All versions" },
                    { id: "release", label: "Releases only" },
                    { id: "snapshot", label: "Snapshots only" },
                  ].map((item) => {
                    const isSelected = versionFilter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full px-3 py-2 rounded-md border-0 text-sm font-medium text-left cursor-pointer transition-colors hover:bg-card/70"
                        style={{
                          background: isSelected ? theme.card : "transparent",
                          color: theme.foreground,
                        }}
                        onClick={() => {
                          setVersionFilter(item.id as any);
                          setFilterMenuOpen(false);
                        }}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Grid / Empty States */}
      {instances.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground text-center border border-border rounded-xl"
          style={{ background: theme.card, borderColor: theme.border }}
        >
          <div
            className="size-16 rounded-2xl flex items-center justify-center mb-1"
            style={{ background: theme.sidebarAccent, color: theme.primary }}
          >
            <Icon name="instance" size={40} color={theme.primary} />
          </div>
          <h2 style={{ color: theme.foreground }}>No instances yet</h2>
          <p style={{ color: theme.mutedForeground }}>
            Create your first pure vanilla Minecraft instance to get started. SeraLauncher supports
            versions from 1.8 to the latest release and automatically installs the required Java
            runtime for you.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border-0 bg-primary text-primary-foreground text-sm font-semibold cursor-pointer transition-all hover:brightness-108 active:scale-95 shrink-0"
            onClick={() => setCreateModalOpen(true)}
          >
            <Icon name="plus" size={18} color={theme.primaryForeground} />
            <span>Create First Instance</span>
          </button>
        </div>
      ) : processedInstances.length === 0 ? (
        <div
          className="text-center py-16 text-xs text-muted-foreground"
          style={{ color: theme.mutedForeground }}
        >
          No instances matching "{search}"
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,195px))] gap-3.5 w-full">
          {processedInstances.map((inst) => {
            const gradient = getPastelGradientForInstance(inst.id || inst.name, inst.icon);
            const iconSrc = getBlockIconSrc(inst.icon);

            return (
              <div
                key={inst.id}
                className="group relative flex flex-col p-2.5 rounded-xl border border-border bg-card select-none cursor-pointer transition-all duration-150 hover:border-primary hover:shadow-[0_8px_20px_rgba(0,0,0,0.15)]"
                onClick={() => {
                  setEffectiveManagingId(inst.id);
                  setEffectiveTab("overview");
                }}
                title={`Manage ${inst.name}`}
              >
                {/* Thumbnail: Square aspect ratio with top & bottom inset shadows */}
                <div
                  className="relative w-full aspect-square rounded-[11px] flex items-center justify-center overflow-hidden shadow-[inset_0_2px_5px_rgba(255,255,255,0.28),inset_0_-2px_6px_rgba(0,0,0,0.35)]"
                  style={{
                    background: `linear-gradient(180deg, ${gradient.top} 0%, ${gradient.bottom} 100%)`,
                  }}
                >
                  <img
                    src={iconSrc}
                    alt={inst.name}
                    className="w-[72%] h-[72%] object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-108 group-hover:-translate-y-0.5"
                    draggable={false}
                  />
                </div>

                {/* Text information */}
                <div className="flex flex-col pt-2 px-1 pb-1 gap-[3px]">
                  <span
                    className="text-[0.92rem] font-bold leading-[1.25] truncate text-foreground"
                    title={inst.name}
                  >
                    {inst.name}
                  </span>
                  <span className="text-[0.76rem] leading-[1.2] truncate text-muted-foreground">
                    Vanilla {inst.mcVersion}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Instance Modal */}
      <AnimatePresence>
        {createModalOpen && (
          <CreateInstanceModal
            theme={theme}
            versions={versions}
            onClose={() => setCreateModalOpen(false)}
            onCreate={async (name, mcVersion, versionType, icon) => {
              await onCreateInstance(name, mcVersion, versionType, icon);
              setCreateModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <DeleteConfirmModal
            theme={theme}
            instanceId={deleteConfirmId}
            instanceName={instances.find((i) => i.id === deleteConfirmId)?.name ?? "this instance"}
            onClose={() => setDeleteConfirmId(null)}
            onConfirm={async () => {
              if (effectiveManagingId === deleteConfirmId) {
                setEffectiveManagingId(null);
              }
              await onDeleteInstance(deleteConfirmId);
              setDeleteConfirmId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Modal to create a new vanilla Minecraft instance */
function formatReleaseDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function getPrefix(l: string): string {
  if (l === "fabric") return "Fabric";
  if (l === "forge") return "Forge";
  if (l === "neoforge") return "NeoForge";
  if (l === "quilt") return "Quilt";
  return "Vanilla";
}

function CreateInstanceModal({
  theme,
  versions,
  onClose,
  onCreate,
}: {
  theme: Theme;
  versions: MinecraftVersion[];
  onClose: () => void;
  onCreate: (
    name: string,
    mcVersion: string,
    versionType: string,
    icon: string,
    loader?: string,
    loaderVersion?: string,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState<"release" | "snapshot">("release");
  const [loader, setLoader] = useState<"vanilla" | "fabric" | "forge" | "neoforge" | "quilt">(
    "vanilla",
  );
  const [search, setSearch] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<MinecraftVersion | null>(() => {
    return versions.find((v) => v.type === "release") ?? versions[0] ?? null;
  });

  const [name, setName] = useState(
    selectedVersion ? `${getPrefix("vanilla")} ${selectedVersion.id}` : "Vanilla Minecraft",
  );
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  // Icon state: selected block & selected pastel gradient background
  const [selectedBlock, setSelectedBlock] = useState<string>(() => getRandomBlockIconKey());
  const [selectedGradientName, setSelectedGradientName] = useState<string>(() =>
    getRandomPastelGradientName(),
  );
  const [iconPickerTab, setIconPickerTab] = useState<"blocks" | "colors">("blocks");
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Available versions in selected tab
  const filteredVersions = useMemo(() => {
    return versions.filter((v) => {
      const matchesTab = tab === "release" ? v.type === "release" : v.type === "snapshot";
      if (!matchesTab) return false;
      if (!search.trim()) return true;
      return v.id.toLowerCase().includes(search.toLowerCase());
    });
  }, [versions, tab, search]);

  const handleSelectVersion = (v: MinecraftVersion) => {
    setSelectedVersion(v);
    if (!nameManuallyEdited) {
      setName(`${getPrefix(loader)} ${v.id}`);
    }
  };

  const handleSelectLoader = (newLoader: "vanilla" | "fabric" | "forge" | "neoforge" | "quilt") => {
    setLoader(newLoader);
    if (!nameManuallyEdited && selectedVersion) {
      setName(`${getPrefix(newLoader)} ${selectedVersion.id}`);
    }
  };

  const handleRandomizeIcon = () => {
    setSelectedBlock(getRandomBlockIconKey());
    setSelectedGradientName(getRandomPastelGradientName());
  };

  const handleCreate = () => {
    if (!selectedVersion || !name.trim()) return;
    const encodedIcon = encodeInstanceIcon(selectedBlock, selectedGradientName);
    onClose();
    onCreate(name.trim(), selectedVersion.id, selectedVersion.type, encodedIcon).catch(
      (err: unknown) => {
        console.error("Failed to create instance:", err);
      },
    );
  };

  const currentGradient = getPastelGradientByName(selectedGradientName);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      theme={theme}
      title="Create Instance"
      maxWidth={540}
      footer={
        <>
          <button
            type="button"
            className="h-8 px-3.5 rounded-md border-0 bg-transparent text-[0.82rem] font-medium cursor-pointer transition-colors duration-120 hover:bg-foreground/5"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md border-0 text-[0.82rem] font-semibold cursor-pointer transition-[opacity,filter] duration-120 hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: theme.primary, color: theme.primaryForeground }}
            onClick={handleCreate}
            disabled={!selectedVersion || !name.trim()}
          >
            Create Instance
          </button>
        </>
      }
    >
      {/* Instance Icon & Name */}
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        {/* Block Icon preview & randomizer */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center" }}>
          <div
            className="relative w-full aspect-[16/10] flex items-center justify-center overflow-hidden"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "10px",
              cursor: "pointer",
              background: `linear-gradient(180deg, ${currentGradient.top} 0%, ${currentGradient.bottom} 100%)`,
            }}
            onClick={() => setShowIconPicker(!showIconPicker)}
            title="Click to customize block and background"
          >
            <img
              src={getBlockIconSrc(selectedBlock)}
              alt="Instance block icon"
              className="size-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-110"
              style={{ width: "72%", height: "72%" }}
            />
          </div>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "11px",
              fontWeight: 500,
              color: theme.primary,
              cursor: "pointer",
              padding: 0,
            }}
            onClick={handleRandomizeIcon}
          >
            Random
          </button>
        </div>

        {/* Name input */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label className="text-xs font-semibold leading-none" style={{ color: theme.foreground }}>
            Instance Name
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
            style={{
              background: theme.sidebarAccent,
              borderColor: theme.border,
              color: theme.foreground,
            }}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameManuallyEdited(true);
            }}
            placeholder="e.g. Vanilla 1.21.4"
          />
        </div>
      </div>

      {/* Interactive Block & Pastel Color Picker */}
      {showIconPicker && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "10px",
            borderRadius: "8px",
            background: theme.sidebarAccent,
            border: `1px solid ${theme.border}`,
          }}
        >
          {/* Tab toggles: Blocks vs Background Colors */}
          <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-secondary">
            <button
              type="button"
              className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition-colors text-center ${iconPickerTab === "blocks" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
              onClick={() => setIconPickerTab("blocks")}
            >
              Block icon ({BLOCK_ICON_KEYS.length})
            </button>
            <button
              type="button"
              className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition-colors text-center ${iconPickerTab === "colors" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
              onClick={() => setIconPickerTab("colors")}
            >
              Background color ({PASTEL_GRADIENTS.length})
            </button>
          </div>

          {iconPickerTab === "blocks" ? (
            <div
              className="grid grid-cols-6 gap-2 p-2 rounded-lg border border-border bg-secondary max-h-[180px] overflow-y-auto"
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              {BLOCK_ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`p-1 rounded-md border cursor-pointer flex items-center justify-center transition-all ${selectedBlock === k ? "border-primary bg-card" : "border-transparent hover:border-border hover:bg-card/50"}`}
                  onClick={() => setSelectedBlock(k)}
                  title={k.replace(/_/g, " ")}
                >
                  <img src={getBlockIconSrc(k)} alt={k} className="size-8 object-contain" />
                </button>
              ))}
            </div>
          ) : (
            <div
              className="grid grid-cols-3 gap-2 p-2 rounded-lg border border-border bg-secondary max-h-[180px] overflow-y-auto"
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              {PASTEL_GRADIENTS.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  className={`flex items-center gap-2 p-1.5 rounded-md border cursor-pointer text-left transition-all ${selectedGradientName === g.name ? "border-primary bg-card" : "border-transparent hover:border-border hover:bg-card/50"}`}
                  onClick={() => setSelectedGradientName(g.name)}
                  title={g.name}
                >
                  <div
                    className="size-6 rounded-full border border-black/20 shrink-0"
                    style={{
                      background: `linear-gradient(180deg, ${g.top} 0%, ${g.bottom} 100%)`,
                    }}
                  />
                  <span className="text-xs font-medium truncate">{g.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mod Loader Selector */}
      <div className="modal-field">
        <label className="modal-label" style={{ color: theme.foreground }}>
          Mod Loader
        </label>
        <div
          className="flex items-center gap-1 p-1 rounded-lg border border-border"
          style={{ background: theme.sidebarAccent }}
        >
          {(
            [
              { id: "vanilla", label: "None (Vanilla)" },
              { id: "fabric", label: "Fabric" },
              { id: "forge", label: "Forge" },
              { id: "neoforge", label: "NeoForge" },
              { id: "quilt", label: "Quilt" },
            ] as const
          ).map((item) => {
            const isSelected = loader === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectLoader(item.id)}
                className="flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-all text-center"
                style={{
                  background: isSelected ? theme.primary : "transparent",
                  color: isSelected ? theme.primaryForeground : theme.mutedForeground,
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Version Selector */}
      <div className="modal-field">
        <div className="flex items-center justify-between mb-2">
          <label className="modal-label" style={{ color: theme.foreground, marginBottom: 0 }}>
            Minecraft Version
          </label>
          <div
            className="flex p-0.5 rounded-md border border-border gap-0.5"
            style={{ background: theme.sidebarAccent, borderColor: theme.border }}
          >
            <button
              type="button"
              className={`border-0 px-2.5 py-1 text-xs font-medium rounded cursor-pointer transition-all ${tab === "release" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
              style={{
                color: tab === "release" ? theme.foreground : theme.mutedForeground,
                background: tab === "release" ? theme.card : "transparent",
              }}
              onClick={() => setTab("release")}
            >
              Releases
            </button>
            <button
              type="button"
              className={`border-0 px-2.5 py-1 text-xs font-medium rounded cursor-pointer transition-all ${tab === "snapshot" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
              style={{
                color: tab === "snapshot" ? theme.foreground : theme.mutedForeground,
                background: tab === "snapshot" ? theme.card : "transparent",
              }}
              onClick={() => setTab("snapshot")}
            >
              Snapshots
            </button>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border mb-2"
          style={{ background: theme.sidebarAccent, borderColor: theme.border }}
        >
          <Icon name="search" size={14} color={theme.mutedForeground} />
          <input
            type="text"
            placeholder="Filter versions (e.g. 1.8, 1.20, 26.3)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: theme.foreground }}
            className="bg-transparent border-0 outline-none text-xs w-full"
          />
        </div>

        <div
          className="max-h-[180px] overflow-y-auto rounded-lg border border-border flex flex-col p-1 gap-0.5"
          style={{ background: theme.sidebarAccent, borderColor: theme.border }}
        >
          {filteredVersions.slice(0, 100).map((v) => {
            const isSelected = selectedVersion?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`flex items-center justify-between w-full px-3 py-2 rounded-md border-0 text-xs text-left cursor-pointer transition-colors ${isSelected ? "font-semibold" : "hover:bg-secondary"}`}
                style={{
                  background: isSelected ? theme.primary : "transparent",
                  color: isSelected ? theme.primaryForeground : theme.foreground,
                }}
                onClick={() => handleSelectVersion(v)}
              >
                <span className="version-item-id font-medium">{v.id}</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px]"
                    style={{
                      color: isSelected ? theme.primaryForeground : theme.mutedForeground,
                      opacity: 0.85,
                    }}
                  >
                    {formatReleaseDate(v.releaseTime)}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider border border-border"
                    style={{
                      background: isSelected ? "rgba(255, 255, 255, 0.2)" : theme.card,
                      color: isSelected ? theme.primaryForeground : theme.mutedForeground,
                    }}
                  >
                    {v.type}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredVersions.length === 0 && (
            <div className="p-4 text-center text-xs" style={{ color: theme.mutedForeground }}>
              No versions match "{search}"
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Full-page Instance Management view.
 *  Uses the expanded app rail for sub-navigation and renders clean full-width content with logs. */
/** Full-page Instance Management view matching screenshot 15 */

function InstanceManagementView({
  theme,
  instance,
  activeTab,
  javaRuntimes = [],
  systemMemoryMb = 8192,
  onRefreshJava,
  runningInstances = [],
  onKillInstance,
  onSelectTab,
  onBack: _onBack,
  onLaunch,
  onOpenFolder,
  onUpdate,
  onDelete,
}: {
  theme: Theme;
  instance: Instance;
  activeTab: InstanceManagementTab;
  javaRuntimes?: JavaRuntime[];
  systemMemoryMb?: number;
  onRefreshJava?: () => void;
  runningInstances?: RunningInstanceInfo[];
  onKillInstance?: (id: string) => Promise<void>;
  onSelectTab?: (tab: InstanceManagementTab) => void;
  onBack?: () => void;
  onLaunch: () => void;
  onOpenFolder: () => Promise<void>;
  onUpdate: (updated: Instance) => Promise<void>;
  onDelete: () => void;
}) {
  const gradient = getPastelGradientForInstance(instance.id || instance.name, instance.icon);
  const iconSrc = getBlockIconSrc(instance.icon);
  const isRunning = Boolean(runningInstances?.some((r) => r.id === instance.id));

  // Top banner 3-dots action menu
  const [bannerMenuOpen, setBannerMenuOpen] = useState(false);
  const bannerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bannerMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (bannerMenuRef.current && !bannerMenuRef.current.contains(e.target as Node)) {
        setBannerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [bannerMenuOpen]);

  // Log viewer state matching screenshot 15
  const [logs, setLogs] = useState<string>("");
  const [logSearch, setLogSearch] = useState("");
  type LogLevel = "error" | "warn" | "info";
  // Empty set means "All" is active; non-empty set holds specific active filters
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(new Set());

  const isAllActive = selectedLevels.size === 0;

  const selectAllLevels = () => {
    setSelectedLevels(new Set()); // Deselects error, warn, and info so only All is active
  };

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };
  const [logExpanded, setLogExpanded] = useState(false);
  const logPreRef = useRef<HTMLPreElement>(null);

  const terminalScreenRef = useRef<HTMLDivElement>(null);

  // Initial load of current session logs
  useEffect(() => {
    if (activeTab !== "overview") return;
    let cancelled = false;
    invoke<string>("get_instance_logs", { id: instance.id })
      .then((output: string) => {
        if (!cancelled && output && output.trim()) {
          setLogs(output.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, instance.id]);

  // Real-time event listener for live streaming lines
  useEffect(() => {
    if (activeTab !== "overview") return;
    let unlisten: (() => void) | null = null;
    let isCancelled = false;

    interface LogPayload {
      id: string;
      line: string;
    }

    listen<LogPayload>("instance_log_line", (event) => {
      if (event.payload.id === instance.id) {
        setLogs((prev) => (prev ? `${prev}\n${event.payload.line}` : event.payload.line));
      }
    }).then((unsub) => {
      if (isCancelled) {
        unsub();
      } else {
        unlisten = unsub;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, [activeTab, instance.id]);

  // Filter logs by search keyword and active severity levels
  const filteredLogLines = useMemo(() => {
    if (!logs.trim()) return [];
    let lines = logs.split("\n");
    if (!isAllActive) {
      lines = lines.filter((l) => {
        const upper = l.toUpperCase();
        const isErr =
          upper.includes("ERROR") || upper.includes("FATAL") || upper.includes("EXCEPTION");
        const isWarn = upper.includes("WARN");
        const isInfo = upper.includes("INFO");
        if (isErr) return selectedLevels.has("error");
        if (isWarn) return selectedLevels.has("warn");
        if (isInfo) return selectedLevels.has("info");
        return selectedLevels.has("info");
      });
    }
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      lines = lines.filter((l) => l.toLowerCase().includes(q));
    }
    return lines;
  }, [logs, isAllActive, selectedLevels, logSearch]);

  // Auto-scroll terminal to bottom as new log lines arrive
  useEffect(() => {
    if (terminalScreenRef.current) {
      terminalScreenRef.current.scrollTop = terminalScreenRef.current.scrollHeight;
    }
  }, [filteredLogLines.length]);

  // Settings form state
  const [name, setName] = useState(instance.name);
  const parsed = parseInstanceIcon(instance.icon, instance.id || instance.name);
  const [selectedBlock, setSelectedBlock] = useState<string>(parsed.blockKey);
  const [selectedGradientName, setSelectedGradientName] = useState<string>(parsed.gradientName);
  const [iconPickerTab, setIconPickerTab] = useState<"blocks" | "colors">("blocks");
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Memory sliders state (using numbers, defaulting to instance values or standard defaults)
  const [minMemory, setMinMemory] = useState<number>(instance.minMemory ?? DEFAULT_MIN_MEMORY);
  const [maxMemory, setMaxMemory] = useState<number>(instance.maxMemory ?? DEFAULT_MAX_MEMORY);
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? "");
  const [customJava, setCustomJava] = useState(instance.customJavaPath ?? "");
  const [customPathMode, setCustomPathMode] = useState(
    () =>
      Boolean(instance.customJavaPath) &&
      !javaRuntimes.some((r) => r.path === instance.customJavaPath),
  );
  const [showArgsModal, setShowArgsModal] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const currentGradient = getPastelGradientByName(selectedGradientName);

  const handleRandomizeIcon = () => {
    setSelectedBlock(getRandomBlockIconKey());
    setSelectedGradientName(getRandomPastelGradientName());
  };

  // Slider limits and calculations matching global settings
  const maxSliderLimit = useMemo(() => {
    const hostGb = Math.round(systemMemoryMb / 1024);
    return Math.max(16384, hostGb * 1024);
  }, [systemMemoryMb]);

  const maxRamMin = 1024;
  const maxRamRange = Math.max(1, maxSliderLimit - maxRamMin);
  const maxRamPercent = Math.min(100, Math.max(0, ((maxMemory - maxRamMin) / maxRamRange) * 100));

  const minRamMin = 512;
  const minRamRange = Math.max(1, maxMemory - minRamMin);
  const minRamPercent = Math.min(100, Math.max(0, ((minMemory - minRamMin) / minRamRange) * 100));

  // Dropdown options for Java runtimes
  const javaOptions = useMemo(() => {
    const list = ["AUTO"];
    for (const rt of javaRuntimes) {
      list.push(rt.path);
    }
    list.push("CUSTOM");
    return list;
  }, [javaRuntimes]);

  const selectedJavaOption = useMemo(() => {
    if (customPathMode) return "CUSTOM";
    if (!customJava) return "AUTO";
    if (javaRuntimes.some((r) => r.path === customJava)) {
      return customJava;
    }
    return "CUSTOM";
  }, [customPathMode, customJava, javaRuntimes]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaveBusy(true);
    setSavedSuccess(false);
    try {
      const updated: Instance = {
        ...instance,
        name: name.trim() || instance.name,
        icon: encodeInstanceIcon(selectedBlock, selectedGradientName),
        minMemory,
        maxMemory,
        jvmArgs: jvmArgs.trim() || null,
        customJavaPath: customJava.trim() || null,
      };
      await onUpdate(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setSaveBusy(false);
    }
  };

  // Synthetic settings object for EffectiveJavaArgsModal preview
  const previewSettings = useMemo<Settings>(() => {
    return {
      appearance: "dark",
      font: "Sunghyun Sans",
      fontSize: 16,
      javaPath: customJava || null,
      minMemory,
      maxMemory,
      gcPreset: "g1gc",
      javaOptimize: true,
      jvmArgs,
    };
  }, [customJava, minMemory, maxMemory, jvmArgs]);

  const loaderLabel = `${instance.versionType === "snapshot" ? "Snapshot" : "Vanilla"} ${instance.mcVersion}`;

  if (activeTab === "settings") {
    return (
      <main className="flex flex-col items-center gap-7 px-6 py-9 w-full overflow-y-auto">
        <h1
          className="w-full max-w-[620px] m-0 text-2xl font-bold tracking-[-0.01em] text-left"
          style={{ color: theme.foreground }}
        >
          Instance Settings
        </h1>

        <section className="w-full max-w-[620px] [&>h2]:m-0 [&>h2]:mb-2 [&>h2]:ml-0.5 [&>h2]:text-[0.8rem] [&>h2]:font-semibold">
          <form onSubmit={handleSaveSettings}>
            <div className="px-[18px] py-1 bg-card rounded-xl border border-border">
              {/* Row 1: Block icon on left with random at bottom, and instance name input with label to its right */}
              <div className="flex items-center justify-between gap-6 py-3 max-[520px]:flex-col max-[520px]:items-start">
                <div
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      className="relative w-full aspect-[16/10] flex items-center justify-center overflow-hidden"
                      style={{
                        width: "54px",
                        height: "54px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        background: `linear-gradient(180deg, ${currentGradient.top} 0%, ${currentGradient.bottom} 100%)`,
                        flexShrink: 0,
                      }}
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      title="Change block or background color"
                    >
                      <img
                        src={getBlockIconSrc(selectedBlock)}
                        alt="Instance icon"
                        className="size-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-110"
                        style={{ width: "72%", height: "72%" }}
                      />
                    </div>
                    <button
                      type="button"
                      style={{
                        background: "transparent",
                        border: 0,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: theme.primary,
                        cursor: "pointer",
                        padding: "0 2px",
                      }}
                      onClick={handleRandomizeIcon}
                      title="Pick random icon"
                    >
                      Random
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      flex: 1,
                      minWidth: 0,
                      paddingTop: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: theme.foreground,
                        lineHeight: 1.15,
                      }}
                    >
                      Instance Name
                    </span>
                    <input
                      type="text"
                      className="settings-input"
                      style={{
                        background: theme.secondary,
                        color: theme.foreground,
                        border: 0,
                        width: "100%",
                        height: "38px",
                        fontSize: "0.92rem",
                        fontWeight: 600,
                      }}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Instance name"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Icon Picker Dropdown */}
              {showIconPicker && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "12px",
                    margin: "6px 0 10px",
                    borderRadius: "8px",
                    background: theme.secondary,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-secondary">
                    <button
                      type="button"
                      className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition-colors text-center ${iconPickerTab === "blocks" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
                      onClick={() => setIconPickerTab("blocks")}
                    >
                      Block icon ({BLOCK_ICON_KEYS.length})
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-1 px-2.5 rounded-md text-xs font-medium transition-colors text-center ${iconPickerTab === "colors" ? "bg-card text-foreground font-semibold shadow-xs" : "bg-transparent text-muted-foreground"}`}
                      onClick={() => setIconPickerTab("colors")}
                    >
                      Background color ({PASTEL_GRADIENTS.length})
                    </button>
                  </div>

                  {iconPickerTab === "blocks" ? (
                    <div
                      className="grid grid-cols-6 gap-2 p-2 rounded-lg border border-border bg-secondary max-h-[180px] overflow-y-auto"
                      style={{ background: "transparent", border: "none", padding: 0 }}
                    >
                      {BLOCK_ICON_KEYS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={`p-1 rounded-md border cursor-pointer flex items-center justify-center transition-all ${selectedBlock === k ? "border-primary bg-card" : "border-transparent hover:border-border hover:bg-card/50"}`}
                          onClick={() => setSelectedBlock(k)}
                          title={k.replace(/_/g, " ")}
                        >
                          <img src={getBlockIconSrc(k)} alt={k} className="size-8 object-contain" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="grid grid-cols-3 gap-2 p-2 rounded-lg border border-border bg-secondary max-h-[180px] overflow-y-auto"
                      style={{ background: "transparent", border: "none", padding: 0 }}
                    >
                      {PASTEL_GRADIENTS.map((g) => (
                        <button
                          key={g.name}
                          type="button"
                          className={`flex items-center gap-2 p-1.5 rounded-md border cursor-pointer text-left transition-all ${selectedGradientName === g.name ? "border-primary bg-card" : "border-transparent hover:border-border hover:bg-card/50"}`}
                          onClick={() => setSelectedGradientName(g.name)}
                          title={g.name}
                        >
                          <div
                            className="size-6 rounded-full border border-black/20 shrink-0"
                            style={{
                              background: `linear-gradient(180deg, ${g.top} 0%, ${g.bottom} 100%)`,
                            }}
                          />
                          <span className="text-xs font-medium truncate">{g.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Row 2: Java Executable */}
              <div className="flex items-center justify-between gap-6 py-[9px] max-[520px]:flex-col max-[520px]:items-start border-t border-muted-foreground/25">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className="flex items-center gap-2 text-[0.95rem] font-semibold"
                    style={{ color: theme.foreground }}
                  >
                    Java Executable
                    {onRefreshJava && (
                      <button
                        type="button"
                        onClick={onRefreshJava}
                        title="Rescan system for installed Java runtimes"
                        aria-label="Rescan system for installed Java runtimes"
                        className="cursor-pointer transition-colors hover:text-primary"
                        style={{ color: theme.mutedForeground }}
                      >
                        <Icon name="refresh" size={16} color="currentColor" />
                      </button>
                    )}
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    style={{ color: theme.mutedForeground }}
                  >
                    {customJava
                      ? `Custom: ${customJava}`
                      : javaRuntimes.length > 0
                        ? `Auto-detected: Java ${javaRuntimes[0].majorVersion} (${javaRuntimes[0].version})`
                        : `Requires Java ${instance.javaVersionRequired} (managed runtime will be used)`}
                  </span>
                </div>

                <div className="shrink-0 flex items-center">
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <Dropdown
                      className="dropdown-wide"
                      value={selectedJavaOption}
                      options={javaOptions}
                      theme={theme}
                      onChange={(option) => {
                        if (option === "AUTO") {
                          setCustomPathMode(false);
                          setCustomJava("");
                        } else if (option === "CUSTOM") {
                          setCustomPathMode(true);
                        } else {
                          setCustomPathMode(false);
                          setCustomJava(option);
                        }
                      }}
                      render={(option) => {
                        if (option === "AUTO") {
                          const top = javaRuntimes[0];
                          return top
                            ? `Auto-detect (Java ${top.majorVersion})`
                            : "Auto-detect (Managed runtime)";
                        }
                        if (option === "CUSTOM") {
                          return "Custom path...";
                        }
                        const match = javaRuntimes.find((r) => r.path === option);
                        if (match) {
                          return `Java ${match.majorVersion} (${match.is64Bit ? "64-bit" : "32-bit"}) · ${match.version}`;
                        }
                        return option;
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Custom Java Path Row if in custom path mode */}
              {customPathMode && (
                <div className="w-full pt-1.5 pb-2.5 border-t border-dashed border-muted-foreground/25">
                  <input
                    type="text"
                    className="settings-input"
                    style={{
                      background: theme.secondary,
                      color: theme.foreground,
                      border: 0,
                    }}
                    value={customJava}
                    placeholder="e.g. /usr/lib/jvm/java-21-openjdk/bin/java or C:\Program Files\Java\...\javaw.exe"
                    onChange={(e) => setCustomJava(e.target.value)}
                  />
                </div>
              )}

              {/* Row 3: Memory Allocation */}
              <div className="flex items-center justify-between gap-6 py-[9px] max-[520px]:flex-col max-[520px]:items-start border-t border-muted-foreground/25">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className="flex items-center gap-2 text-[0.95rem] font-semibold"
                    style={{ color: theme.foreground }}
                  >
                    Memory Allocation
                    <button
                      type="button"
                      disabled={
                        minMemory === DEFAULT_MIN_MEMORY && maxMemory === DEFAULT_MAX_MEMORY
                      }
                      onClick={() => {
                        setMinMemory(DEFAULT_MIN_MEMORY);
                        setMaxMemory(DEFAULT_MAX_MEMORY);
                      }}
                      title="Reset memory allocation"
                      aria-label="Reset memory allocation"
                      className="transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:opacity-80"
                      style={{
                        color:
                          minMemory === DEFAULT_MIN_MEMORY && maxMemory === DEFAULT_MAX_MEMORY
                            ? theme.mutedForeground
                            : theme.primary,
                      }}
                    >
                      <Icon name="reset" size={16} color="currentColor" />
                    </button>
                  </span>
                  <span
                    className="text-xs text-muted-foreground"
                    style={{ color: theme.mutedForeground }}
                  >
                    Minimum (-Xms) and Maximum (-Xmx) heap size. Host: ~
                    {(systemMemoryMb / 1024).toFixed(1)} GB RAM
                  </span>
                </div>

                <div className="shrink-0 flex items-center">
                  <div className="flex flex-col gap-2.5 py-2 w-full">
                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {MEMORY_PRESETS.map((p) => {
                        const isActive = maxMemory === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer border border-border transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "bg-secondary text-foreground hover:bg-card"
                            }`}
                            onClick={() => {
                              const newMax = p.value;
                              const newMin = Math.min(minMemory, newMax);
                              setMaxMemory(newMax);
                              setMinMemory(newMin);
                            }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Max RAM slider */}
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between text-xs text-muted-foreground font-mono">
                        <span style={{ color: theme.mutedForeground }}>Maximum RAM:</span>
                        <strong style={{ color: theme.foreground }}>
                          {(maxMemory / 1024).toFixed(1)} GB ({maxMemory} MB)
                        </strong>
                      </div>
                      <input
                        type="range"
                        className="settings-slider"
                        min={1024}
                        max={maxSliderLimit}
                        step={512}
                        value={maxMemory}
                        style={{
                          background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${maxRamPercent}%, ${theme.secondary} ${maxRamPercent}%, ${theme.secondary} 100%)`,
                        }}
                        onChange={(e) => {
                          const newMax = Number(e.target.value);
                          const newMin = Math.min(minMemory, newMax);
                          setMaxMemory(newMax);
                          setMinMemory(newMin);
                        }}
                      />
                    </div>

                    {/* Min RAM slider */}
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between text-xs text-muted-foreground font-mono">
                        <span style={{ color: theme.mutedForeground }}>Minimum RAM:</span>
                        <strong style={{ color: theme.foreground }}>
                          {(minMemory / 1024).toFixed(1)} GB ({minMemory} MB)
                        </strong>
                      </div>
                      <input
                        type="range"
                        className="settings-slider"
                        min={512}
                        max={maxMemory}
                        step={256}
                        value={minMemory}
                        style={{
                          background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${minRamPercent}%, ${theme.secondary} ${minRamPercent}%, ${theme.secondary} 100%)`,
                        }}
                        onChange={(e) => {
                          const newMin = Number(e.target.value);
                          setMinMemory(newMin);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 4: Custom Java Arguments */}
              <div className="flex flex-col gap-2 py-3 border-t border-muted-foreground/25">
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span
                      className="flex items-center gap-2 text-[0.95rem] font-semibold"
                      style={{ color: theme.foreground }}
                    >
                      Custom Java Arguments
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!jvmArgs.trim()}
                          onClick={() => setJvmArgs("")}
                          title="Clear custom Java arguments"
                          aria-label="Clear custom Java arguments"
                          className="transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:opacity-80"
                          style={{
                            color: !jvmArgs.trim() ? theme.mutedForeground : theme.primary,
                          }}
                        >
                          <Icon name="reset" size={16} color="currentColor" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowArgsModal(true)}
                          title="View effective Java arguments"
                          aria-label="View effective Java arguments"
                          style={{ color: theme.mutedForeground }}
                        >
                          <Icon name="eye" size={16} color={theme.mutedForeground} />
                        </button>
                      </span>
                    </span>
                    <span
                      className="text-xs text-muted-foreground"
                      style={{ color: theme.mutedForeground }}
                    >
                      Additional custom arguments appended to the launch command
                    </span>
                  </div>
                </div>

                <textarea
                  className="w-full p-2.5 rounded-lg border-0 bg-secondary text-foreground text-xs font-mono resize-y min-h-[72px] outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  style={{
                    background: theme.secondary,
                    color: theme.foreground,
                    border: 0,
                  }}
                  value={jvmArgs}
                  placeholder="e.g. -Dsun.rmi.dgc.server.gcInterval=2147483646 -XX:+UseStringDeduplication"
                  onChange={(e) => setJvmArgs(e.target.value)}
                />
              </div>

              {/* Action buttons: Inside the box */}
              <div className="flex justify-end items-center gap-2.5 pt-2 pb-2.5 w-full">
                {savedSuccess && (
                  <span
                    style={{
                      fontSize: "0.82rem",
                      color: theme.success,
                      fontWeight: 500,
                      marginRight: "auto",
                    }}
                  >
                    Settings saved!
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-md border-0 bg-red-500 hover:bg-red-600 text-white text-[0.82rem] font-semibold cursor-pointer transition-all hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={onDelete}
                  disabled={saveBusy}
                  title="Delete this instance"
                >
                  Delete Instance
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-[0.82rem] font-semibold cursor-pointer transition-all hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: theme.primary, color: theme.primaryForeground }}
                  disabled={saveBusy}
                >
                  {saveBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <EffectiveJavaArgsModal
          isOpen={showArgsModal}
          onClose={() => setShowArgsModal(false)}
          settings={previewSettings}
          theme={theme}
        />
      </main>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 min-h-full">
      <div className="flex flex-col gap-5 w-full">
        {activeTab === "overview" && (
          <>
            {/* Top Box: Overview Header Banner with Play button and 3-dots action menu */}
            <div className="flex items-center justify-between p-5 rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="instance-overview-art"
                  style={{
                    background: `linear-gradient(180deg, ${gradient.top} 0%, ${gradient.bottom} 100%)`,
                  }}
                >
                  <img
                    src={iconSrc}
                    alt={instance.name}
                    className="size-16 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-110"
                    draggable={false}
                  />
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{instance.name}</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">
                      <Icon name="cubes" size={14} color="currentColor" />
                      <span>{loaderLabel}</span>
                    </span>
                    <span className="opacity-50">•</span>
                    <span className="font-medium">
                      <Icon name="clock" size={14} color="currentColor" />
                      <span>{formatPlayTime(instance.playTimeSeconds)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons inside the top box: switches to Stop when game is running */}
              <div className="flex items-center gap-2.5 shrink-0">
                {isRunning ? (
                  <button
                    type="button"
                    className="instance-banner-play-btn running"
                    style={{ background: theme.destructive, color: "#ffffff" }}
                    onClick={() => onKillInstance?.(instance.id)}
                    title="Stop instance"
                  >
                    <Icon name="playerStop" size={15} color="#ffffff" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="instance-banner-play-btn"
                    style={{ background: theme.success, color: "#ffffff" }}
                    onClick={() => {
                      setLogs("");
                      onLaunch();
                    }}
                    title="Play instance"
                  >
                    <Icon name="play" size={15} color="#ffffff" />
                    <span>Play</span>
                  </button>
                )}

                <div className="relative inline-block" ref={bannerMenuRef}>
                  <button
                    type="button"
                    className="size-10 rounded-xl border border-border bg-card flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors"
                    onClick={() => setBannerMenuOpen(!bannerMenuOpen)}
                    title="More actions"
                  >
                    <Icon name="dots" size={16} color="currentColor" />
                  </button>

                  <AnimatePresence>
                    {bannerMenuOpen && (
                      <motion.div
                        className="absolute right-0 top-[calc(100%+6px)] min-w-[170px] p-1 rounded-xl border border-border bg-card shadow-2xl z-30 flex flex-col gap-0.5"
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.12 }}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border-0 bg-transparent text-xs font-medium text-left cursor-pointer transition-colors hover:bg-secondary"
                          onClick={() => {
                            setBannerMenuOpen(false);
                            onOpenFolder();
                          }}
                        >
                          <Icon name="folder" size={14} color="currentColor" />
                          <span>Open folder</span>
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border-0 bg-transparent text-xs font-medium text-left cursor-pointer transition-colors hover:bg-secondary"
                          onClick={() => {
                            setBannerMenuOpen(false);
                            if (onSelectTab) onSelectTab("settings");
                          }}
                        >
                          <Icon name="settings" size={14} color="currentColor" />
                          <span>Instance settings</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Instance Logs Widget */}
            {logExpanded && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40"
                onClick={() => setLogExpanded(false)}
              />
            )}
            <div
              className={`flex flex-col gap-2.5 w-full ${logExpanded ? "fixed inset-6 z-50 p-5 rounded-2xl border border-border bg-card shadow-2xl" : ""}`}
            >
              {/* Row 1: Search logs + Live Log dropdown */}
              <div className="flex items-center gap-2.5 w-full">
                <div className="flex-1 flex items-center gap-2.5 h-[38px] px-3 rounded-lg border border-border bg-card/60 focus-within:border-primary transition-colors">
                  <Icon name="search" size={15} color={theme.mutedForeground} />
                  <input
                    type="text"
                    className="flex-1 bg-transparent border-0 text-foreground text-[0.84rem] outline-none placeholder:text-muted-foreground"
                    placeholder="Search logs"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 h-[38px] px-3.5 rounded-lg border border-border bg-secondary text-xs font-semibold cursor-pointer shrink-0"
                >
                  {isRunning && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#22c55e",
                        display: "inline-block",
                      }}
                    />
                  )}
                  <span>{isRunning ? "Live Log" : logs ? "Last Session" : "Live Log"}</span>
                  <Icon name="chevronDown" size={13} color="currentColor" />
                </button>
              </div>

              {/* Row 2: Filter pills + Expand / Minimize button */}
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5">
                  <Icon name="filter" size={14} color={theme.mutedForeground} />
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border border-border cursor-pointer transition-all ${isAllActive ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                    onClick={selectAllLevels}
                    title="Show all log levels"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border border-border cursor-pointer transition-all ${selectedLevels.has("error") ? "bg-destructive text-destructive-foreground font-semibold" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                    onClick={() => toggleLevel("error")}
                    title="Toggle error logs"
                  >
                    Error
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border border-border cursor-pointer transition-all ${selectedLevels.has("warn") ? "bg-amber-500/20 text-amber-500 font-semibold border-amber-500/40" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                    onClick={() => toggleLevel("warn")}
                    title="Toggle warning logs"
                  >
                    Warn
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border border-border cursor-pointer transition-all ${selectedLevels.has("info") ? "bg-blue-500/20 text-blue-500 font-semibold border-blue-500/40" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                    onClick={() => toggleLevel("info")}
                    title="Toggle info logs"
                  >
                    Info
                  </button>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md border border-border bg-secondary hover:bg-card transition-colors cursor-pointer shrink-0"
                  onClick={() => setLogExpanded(!logExpanded)}
                  title={logExpanded ? "Minimize" : "Expand"}
                >
                  <Icon
                    name={logExpanded ? "minimize" : "maximize"}
                    size={14}
                    color="currentColor"
                  />
                  <span>{logExpanded ? "Minimize" : "Expand"}</span>
                </button>
              </div>

              {/* Row 3: Terminal screen */}
              <div
                ref={terminalScreenRef}
                className="w-full flex-1 min-h-[300px] max-h-[480px] rounded-xl border border-border bg-black/90 p-3 overflow-y-auto font-mono text-xs select-text"
              >
                <pre
                  ref={logPreRef}
                  className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all m-0"
                >
                  {!logs.trim() ? (
                    <span className="instance-log-row info">
                      [INFO] If there are no logs, please run an instance to see logs or start
                      receiving logs.
                    </span>
                  ) : filteredLogLines.length === 0 ? (
                    <span style={{ color: theme.mutedForeground }}>
                      No logs matching current filter.
                    </span>
                  ) : (
                    filteredLogLines.map((line, idx) => {
                      const isErr = line.toUpperCase().includes("ERROR");
                      const isWarn = line.toUpperCase().includes("WARN");
                      const isInfo = line.toUpperCase().includes("INFO");
                      return (
                        <span
                          key={idx}
                          className={`instance-log-row ${isErr ? "error" : isWarn ? "warn" : isInfo ? "info" : ""}`}
                        >
                          {line}
                          {"\n"}
                        </span>
                      );
                    })
                  )}
                </pre>
              </div>
            </div>
          </>
        )}

        {activeTab === "mods" && (
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-semibold m-0">Mods</h3>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors"
                onClick={onOpenFolder}
              >
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Mods Folder</span>
              </button>
            </div>
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3 text-muted-foreground text-sm [&>p]:m-0 [&>p]:max-w-[400px] [&>p]:leading-relaxed">
              <Icon name="puzzle" size={32} color={theme.mutedForeground} />
              <p>Install mod files (.jar) by placing them into the instance's mods folder.</p>
            </div>
          </div>
        )}

        {activeTab === "resourcepacks" && (
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-semibold m-0">Resource Packs</h3>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors"
                onClick={onOpenFolder}
              >
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Resource Packs Folder</span>
              </button>
            </div>
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3 text-muted-foreground text-sm [&>p]:m-0 [&>p]:max-w-[400px] [&>p]:leading-relaxed">
              <Icon name="palette" size={32} color={theme.mutedForeground} />
              <p>
                Place .zip resource packs into your instance folder to customize block textures and
                music.
              </p>
            </div>
          </div>
        )}

        {activeTab === "shaders" && (
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-semibold m-0">Shader Packs</h3>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors"
                onClick={onOpenFolder}
              >
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Shaderpacks Folder</span>
              </button>
            </div>
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3 text-muted-foreground text-sm [&>p]:m-0 [&>p]:max-w-[400px] [&>p]:leading-relaxed">
              <Icon name="wand" size={32} color={theme.mutedForeground} />
              <p>
                Install custom shaderpacks (.zip) to enhance shadows, lighting, and water
                reflections.
              </p>
            </div>
          </div>
        )}

        {activeTab === "screenshots" && (
          <div className="flex flex-col gap-4 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-semibold m-0">Screenshots</h3>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors"
                onClick={onOpenFolder}
              >
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Screenshots Folder</span>
              </button>
            </div>
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3 text-muted-foreground text-sm [&>p]:m-0 [&>p]:max-w-[400px] [&>p]:leading-relaxed">
              <Icon name="photo" size={32} color={theme.mutedForeground} />
              <p>In-game screenshots taken with the F2 key are saved directly in this folder.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  theme,
  instanceId: _instanceId,
  instanceName,
  onClose,
  onConfirm,
}: {
  theme: Theme;
  instanceId: string;
  instanceName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    await onConfirm();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      theme={theme}
      title={<span style={{ color: theme.destructive }}>Delete Instance</span>}
      maxWidth={420}
      footer={
        <>
          <button
            type="button"
            className="h-8 px-3.5 rounded-md border-0 bg-transparent text-[0.82rem] font-medium cursor-pointer transition-colors duration-120 hover:bg-foreground/5"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md border-0 text-[0.82rem] font-semibold cursor-pointer transition-[opacity,filter] duration-120 hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: theme.destructive, color: "#fff" }}
            onClick={handleDelete}
            disabled={busy}
          >
            {busy ? "Deleting..." : "Delete Permanently"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5" }}>
        Are you sure you want to delete <strong>{instanceName}</strong>? All worlds, configurations,
        and saves inside its directory will be deleted.
      </p>
    </Modal>
  );
}
