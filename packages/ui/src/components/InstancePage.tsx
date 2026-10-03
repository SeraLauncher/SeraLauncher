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
import type { JavaRuntime } from "../settings";
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
  javaRuntimes: JavaRuntime[];
  managingInstanceId?: string | null;
  onSelectManagingInstanceId?: (id: string | null) => void;
  activeManagementTab?: InstanceManagementTab;
  onSelectManagementTab?: (tab: InstanceManagementTab) => void;
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
    <div className="instance-page-container">
      {/* Title */}
      <h1 className="instance-page-title" style={{ color: theme.foreground }}>
        Instance
      </h1>

      {/* Modern Toolbar matching reference */}
      <div className="instance-toolbar">
        {/* Row 1: Search bar + New instance button */}
        <div className="instance-toolbar-row-top">
          <div className="instance-search-bar">
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
            className="instance-btn-new"
            onClick={() => setCreateModalOpen(true)}
          >
            <Icon name="plus" size={17} color={theme.primaryForeground} />
            <span>New instance</span>
          </button>
        </div>

        {/* Row 2: Sort dropdown + Filter dropdown */}
        <div className="instance-toolbar-row-bottom">
          <div className="instance-sort-dropdown-wrap" ref={sortMenuRef}>
            <button
              type="button"
              className="instance-pill-btn"
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
                  className="instance-sort-menu"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  <button
                    type="button"
                    className={`instance-sort-option ${sortBy === "lastPlayed" ? "selected" : ""}`}
                    onClick={() => {
                      setSortBy("lastPlayed");
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>Last played</span>
                    {sortBy === "lastPlayed" && (
                      <Icon name="check" size={14} color={theme.primary} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`instance-sort-option ${sortBy === "name" ? "selected" : ""}`}
                    onClick={() => {
                      setSortBy("name");
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>Name</span>
                    {sortBy === "name" && <Icon name="check" size={14} color={theme.primary} />}
                  </button>
                  <button
                    type="button"
                    className={`instance-sort-option ${sortBy === "version" ? "selected" : ""}`}
                    onClick={() => {
                      setSortBy("version");
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>Minecraft version</span>
                    {sortBy === "version" && <Icon name="check" size={14} color={theme.primary} />}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="instance-toolbar-divider" />

          {/* Filter dropdown */}
          <div className="instance-sort-dropdown-wrap" ref={filterMenuRef}>
            <button
              type="button"
              className={`instance-pill-btn ${versionFilter !== "all" ? "active" : ""}`}
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
                  className="instance-sort-menu"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  <button
                    type="button"
                    className={`instance-sort-option ${versionFilter === "all" ? "selected" : ""}`}
                    onClick={() => {
                      setVersionFilter("all");
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span>All versions</span>
                    {versionFilter === "all" && (
                      <Icon name="check" size={14} color={theme.primary} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`instance-sort-option ${versionFilter === "release" ? "selected" : ""}`}
                    onClick={() => {
                      setVersionFilter("release");
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span>Releases only</span>
                    {versionFilter === "release" && (
                      <Icon name="check" size={14} color={theme.primary} />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`instance-sort-option ${versionFilter === "snapshot" ? "selected" : ""}`}
                    onClick={() => {
                      setVersionFilter("snapshot");
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span>Snapshots only</span>
                    {versionFilter === "snapshot" && (
                      <Icon name="check" size={14} color={theme.primary} />
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Main Grid / Empty States */}
      {instances.length === 0 ? (
        <div
          className="instance-empty-state"
          style={{ background: theme.card, borderColor: theme.border }}
        >
          <div
            className="instance-empty-icon"
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
            className="instance-btn-new"
            onClick={() => setCreateModalOpen(true)}
          >
            <Icon name="plus" size={18} color={theme.primaryForeground} />
            <span>Create First Instance</span>
          </button>
        </div>
      ) : processedInstances.length === 0 ? (
        <div className="instance-no-match" style={{ color: theme.mutedForeground }}>
          No instances matching "{search}"
        </div>
      ) : (
        <div className="instance-grid">
          {processedInstances.map((inst) => {
            const gradient = getPastelGradientForInstance(inst.id || inst.name, inst.icon);
            const iconSrc = getBlockIconSrc(inst.icon);

            return (
              <div
                key={inst.id}
                className="instance-modern-card"
                onClick={() => {
                  setEffectiveManagingId(inst.id);
                  setEffectiveTab("overview");
                }}
                title={`Manage ${inst.name}`}
              >
                {/* Floating quick actions */}
                <div className="instance-card-hover-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="instance-card-quick-btn danger"
                    onClick={() => setDeleteConfirmId(inst.id)}
                    title="Delete instance"
                  >
                    <Icon name="trash" size={14} color="#fff" />
                  </button>
                </div>

                {/* Thumbnail: Pastel gradient + Top inset shadow + Transparent block */}
                <div
                  className="instance-card-art"
                  style={{
                    background: `linear-gradient(180deg, ${gradient.top} 0%, ${gradient.bottom} 100%)`,
                  }}
                >
                  <img
                    src={iconSrc}
                    alt={inst.name}
                    className="instance-block-img"
                    draggable={false}
                  />
                </div>

                {/* Text information */}
                <div className="instance-card-info">
                  <span className="instance-card-primary-title" title={inst.name}>
                    {inst.name}
                  </span>
                  <span className="instance-card-secondary-desc">Vanilla {inst.mcVersion}</span>
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
            javaRuntimes={javaRuntimes}
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
function CreateInstanceModal({
  theme,
  versions,
  javaRuntimes,
  onClose,
  onCreate,
}: {
  theme: Theme;
  versions: MinecraftVersion[];
  javaRuntimes: JavaRuntime[];
  onClose: () => void;
  onCreate: (name: string, mcVersion: string, versionType: string, icon: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"release" | "snapshot">("release");
  const [search, setSearch] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<MinecraftVersion | null>(() => {
    return versions.find((v) => v.type === "release") ?? versions[0] ?? null;
  });
  const [name, setName] = useState(
    selectedVersion ? `Vanilla ${selectedVersion.id}` : "Vanilla Minecraft",
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

  const reqJava = selectedVersion?.requiredJavaVersion ?? 21;

  // Check if compatible Java is installed
  const hasMatchingJava = useMemo(() => {
    return javaRuntimes.some((r) => {
      if (reqJava === 8) return r.majorVersion === 8;
      if (reqJava === 16 || reqJava === 17) return r.majorVersion === 16 || r.majorVersion === 17;
      return r.majorVersion >= 21;
    });
  }, [javaRuntimes, reqJava]);

  const handleSelectVersion = (v: MinecraftVersion) => {
    setSelectedVersion(v);
    if (!nameManuallyEdited) {
      setName(`Vanilla ${v.id}`);
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
      title="Create Vanilla Instance"
      maxWidth={540}
      footer={
        <>
          <button
            type="button"
            className="modal-cancel-btn"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm-btn"
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
            className="instance-card-art"
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
              className="instance-block-img"
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
        <div className="modal-field" style={{ flex: 1 }}>
          <label className="modal-label" style={{ color: theme.foreground }}>
            Instance Name
          </label>
          <input
            type="text"
            className="modal-text-input"
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
          <div className="icon-picker-tabs">
            <button
              type="button"
              className={`icon-picker-tab-btn ${iconPickerTab === "blocks" ? "active" : ""}`}
              onClick={() => setIconPickerTab("blocks")}
            >
              Block icon ({BLOCK_ICON_KEYS.length})
            </button>
            <button
              type="button"
              className={`icon-picker-tab-btn ${iconPickerTab === "colors" ? "active" : ""}`}
              onClick={() => setIconPickerTab("colors")}
            >
              Background color ({PASTEL_GRADIENTS.length})
            </button>
          </div>

          {iconPickerTab === "blocks" ? (
            <div
              className="block-picker-grid"
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              {BLOCK_ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`block-picker-item ${selectedBlock === k ? "selected" : ""}`}
                  onClick={() => setSelectedBlock(k)}
                  title={k.replace(/_/g, " ")}
                >
                  <img src={getBlockIconSrc(k)} alt={k} className="block-picker-img" />
                </button>
              ))}
            </div>
          ) : (
            <div
              className="gradient-picker-grid"
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              {PASTEL_GRADIENTS.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  className={`gradient-picker-item ${selectedGradientName === g.name ? "selected" : ""}`}
                  onClick={() => setSelectedGradientName(g.name)}
                  title={g.name}
                >
                  <div
                    className="gradient-swatch-circle"
                    style={{
                      background: `linear-gradient(180deg, ${g.top} 0%, ${g.bottom} 100%)`,
                    }}
                  />
                  <span className="gradient-swatch-name">{g.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Version Selector */}
      <div className="modal-field">
        <div className="version-tabs-row">
          <label className="modal-label" style={{ color: theme.foreground, marginBottom: 0 }}>
            Minecraft Version
          </label>
          <div
            className="version-tabs"
            style={{ background: theme.sidebarAccent, borderColor: theme.border }}
          >
            <button
              type="button"
              className={`version-tab ${tab === "release" ? "active" : ""}`}
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
              className={`version-tab ${tab === "snapshot" ? "active" : ""}`}
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
          className="version-search-wrap"
          style={{ background: theme.sidebarAccent, borderColor: theme.border }}
        >
          <Icon name="search" size={14} color={theme.mutedForeground} />
          <input
            type="text"
            placeholder="Filter versions (e.g. 1.8, 1.20, 26.3)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ color: theme.foreground }}
            className="version-search-input"
          />
        </div>

        <div
          className="version-scroll-list"
          style={{ background: theme.sidebarAccent, borderColor: theme.border }}
        >
          {filteredVersions.slice(0, 100).map((v) => {
            const isSelected = selectedVersion?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`version-item ${isSelected ? "selected" : ""}`}
                style={{
                  background: isSelected ? theme.primary : "transparent",
                  color: isSelected ? theme.primaryForeground : theme.foreground,
                }}
                onClick={() => handleSelectVersion(v)}
              >
                <span className="version-item-id">{v.id}</span>
                <span
                  className="version-item-java"
                  style={{
                    color: isSelected ? theme.primaryForeground : theme.mutedForeground,
                  }}
                >
                  Java {v.requiredJavaVersion}
                </span>
              </button>
            );
          })}
          {filteredVersions.length === 0 && (
            <div className="version-empty" style={{ color: theme.mutedForeground }}>
              No versions match "{search}"
            </div>
          )}
        </div>
      </div>

      {/* Java Requirement Status Card */}
      <div
        className="java-status-card"
        style={{
          background: theme.sidebarAccent,
          borderColor: theme.border,
        }}
      >
        <div className="java-status-icon">
          <Icon name="coffee" size={20} color={theme.primary} />
        </div>
        <div className="java-status-content">
          <div className="java-status-title" style={{ color: theme.foreground }}>
            Target Runtime: Java {reqJava}
          </div>
          <div className="java-status-desc" style={{ color: theme.mutedForeground }}>
            {hasMatchingJava ? (
              <span className="java-status-detected" style={{ color: theme.primary }}>
                ✓ Compatible Java {reqJava} detected on your system.
              </span>
            ) : (
              <span className="java-status-autodownload">
                Java {reqJava} is not installed. SeraLauncher will automatically download and set up
                Eclipse Temurin Java {reqJava} for this instance.
              </span>
            )}
          </div>
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
  }, [filteredLogLines]);

  // Settings form state
  const [name, setName] = useState(instance.name);
  const parsed = parseInstanceIcon(instance.icon, instance.id || instance.name);
  const [selectedBlock, setSelectedBlock] = useState<string>(parsed.blockKey);
  const [selectedGradientName, setSelectedGradientName] = useState<string>(parsed.gradientName);
  const [iconPickerTab, setIconPickerTab] = useState<"blocks" | "colors">("blocks");
  const [showIconPicker, setShowIconPicker] = useState(false);

  const [minMemory, setMinMemory] = useState(instance.minMemory ? String(instance.minMemory) : "");
  const [maxMemory, setMaxMemory] = useState(instance.maxMemory ? String(instance.maxMemory) : "");
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? "");
  const [customJava, setCustomJava] = useState(instance.customJavaPath ?? "");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const currentGradient = getPastelGradientByName(selectedGradientName);

  const handleRandomizeIcon = () => {
    setSelectedBlock(getRandomBlockIconKey());
    setSelectedGradientName(getRandomPastelGradientName());
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaveBusy(true);
    setSavedSuccess(false);
    try {
      const updated: Instance = {
        ...instance,
        name: name.trim() || instance.name,
        icon: encodeInstanceIcon(selectedBlock, selectedGradientName),
        minMemory: minMemory ? parseInt(minMemory, 10) || null : null,
        maxMemory: maxMemory ? parseInt(maxMemory, 10) || null : null,
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

  const loaderLabel = `${instance.versionType === "snapshot" ? "Snapshot" : "Vanilla"} ${instance.mcVersion}`;

  return (
    <div className="instance-page-container">
      <div className="instance-mgmt-container">
        {activeTab === "overview" && (
          <>
            {/* Top Box: Overview Header Banner with Play button and 3-dots action menu */}
            <div className="instance-overview-banner">
              <div className="instance-overview-left">
                <div
                  className="instance-overview-art"
                  style={{
                    background: `linear-gradient(180deg, ${gradient.top} 0%, ${gradient.bottom} 100%)`,
                  }}
                >
                  <img
                    src={iconSrc}
                    alt={instance.name}
                    className="instance-block-img"
                    draggable={false}
                  />
                </div>

                <div className="instance-overview-details">
                  <h2 className="instance-overview-title">{instance.name}</h2>
                  <div className="instance-overview-meta-row">
                    <span className="instance-overview-meta-item">
                      <Icon name="cubes" size={14} color="currentColor" />
                      <span>{loaderLabel}</span>
                    </span>
                    <span className="instance-overview-meta-dot">•</span>
                    <span className="instance-overview-meta-item">
                      <Icon name="clock" size={14} color="currentColor" />
                      <span>{formatPlayTime(instance.playTimeSeconds)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons inside the top box: switches to Stop when game is running */}
              <div className="instance-banner-actions">
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

                <div className="instance-banner-dots-wrap" ref={bannerMenuRef}>
                  <button
                    type="button"
                    className="instance-banner-dots-btn"
                    onClick={() => setBannerMenuOpen(!bannerMenuOpen)}
                    title="More actions"
                  >
                    <Icon name="dots" size={16} color="currentColor" />
                  </button>

                  <AnimatePresence>
                    {bannerMenuOpen && (
                      <motion.div
                        className="instance-banner-dropdown"
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.12 }}
                      >
                        <button
                          type="button"
                          className="instance-banner-dropdown-item"
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
                          className="instance-banner-dropdown-item"
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
              <div className="instance-logs-backdrop" onClick={() => setLogExpanded(false)} />
            )}
            <div className={`instance-logs-widget ${logExpanded ? "expanded" : ""}`}>
              {/* Row 1: Search logs + Live Log dropdown */}
              <div className="instance-logs-top-bar">
                <div className="instance-logs-search-wrap">
                  <Icon name="search" size={15} color={theme.mutedForeground} />
                  <input
                    type="text"
                    className="instance-logs-search-input"
                    placeholder="Search logs"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                  />
                </div>

                <button type="button" className="instance-logs-type-btn">
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
              <div className="instance-logs-filter-bar">
                <div className="instance-logs-filter-group">
                  <Icon name="filter" size={14} color={theme.mutedForeground} />
                  <button
                    type="button"
                    className={`instance-logs-filter-pill ${isAllActive ? "active" : ""}`}
                    onClick={selectAllLevels}
                    title="Show all log levels"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`instance-logs-filter-pill error ${selectedLevels.has("error") ? "active" : ""}`}
                    onClick={() => toggleLevel("error")}
                    title="Toggle error logs"
                  >
                    Error
                  </button>
                  <button
                    type="button"
                    className={`instance-logs-filter-pill warn ${selectedLevels.has("warn") ? "active" : ""}`}
                    onClick={() => toggleLevel("warn")}
                    title="Toggle warning logs"
                  >
                    Warn
                  </button>
                  <button
                    type="button"
                    className={`instance-logs-filter-pill ${selectedLevels.has("info") ? "active" : ""}`}
                    onClick={() => toggleLevel("info")}
                    title="Toggle info logs"
                  >
                    Info
                  </button>
                </div>

                <button
                  type="button"
                  className="instance-logs-expand-btn"
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
              <div ref={terminalScreenRef} className="instance-logs-screen">
                <pre ref={logPreRef} className="instance-logs-console-pre">
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
          <div className="instance-tab-panel">
            <div className="instance-tab-panel-header">
              <h3 className="instance-tab-panel-title">Mods</h3>
              <button type="button" className="instance-overview-sub-btn" onClick={onOpenFolder}>
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Mods Folder</span>
              </button>
            </div>
            <div className="instance-tab-empty">
              <Icon name="puzzle" size={32} color={theme.mutedForeground} />
              <p>Install mod files (.jar) by placing them into the instance's mods folder.</p>
            </div>
          </div>
        )}

        {activeTab === "resourcepacks" && (
          <div className="instance-tab-panel">
            <div className="instance-tab-panel-header">
              <h3 className="instance-tab-panel-title">Resource Packs</h3>
              <button type="button" className="instance-overview-sub-btn" onClick={onOpenFolder}>
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Resource Packs Folder</span>
              </button>
            </div>
            <div className="instance-tab-empty">
              <Icon name="palette" size={32} color={theme.mutedForeground} />
              <p>
                Place .zip resource packs into your instance folder to customize block textures and
                music.
              </p>
            </div>
          </div>
        )}

        {activeTab === "shaders" && (
          <div className="instance-tab-panel">
            <div className="instance-tab-panel-header">
              <h3 className="instance-tab-panel-title">Shader Packs</h3>
              <button type="button" className="instance-overview-sub-btn" onClick={onOpenFolder}>
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Shaderpacks Folder</span>
              </button>
            </div>
            <div className="instance-tab-empty">
              <Icon name="wand" size={32} color={theme.mutedForeground} />
              <p>
                Install custom shaderpacks (.zip) to enhance shadows, lighting, and water
                reflections.
              </p>
            </div>
          </div>
        )}

        {activeTab === "screenshots" && (
          <div className="instance-tab-panel">
            <div className="instance-tab-panel-header">
              <h3 className="instance-tab-panel-title">Screenshots</h3>
              <button type="button" className="instance-overview-sub-btn" onClick={onOpenFolder}>
                <Icon name="folder" size={14} color="currentColor" />
                <span>Open Screenshots Folder</span>
              </button>
            </div>
            <div className="instance-tab-empty">
              <Icon name="photo" size={32} color={theme.mutedForeground} />
              <p>In-game screenshots taken with the F2 key are saved directly in this folder.</p>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <form onSubmit={handleSaveSettings} className="instance-settings-form">
            <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                  alignItems: "center",
                }}
              >
                <div
                  className="instance-card-art"
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    background: `linear-gradient(180deg, ${currentGradient.top} 0%, ${currentGradient.bottom} 100%)`,
                  }}
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  title="Change block or background color"
                >
                  <img
                    src={getBlockIconSrc(selectedBlock)}
                    alt="Instance icon"
                    className="instance-block-img"
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

              <div className="modal-field" style={{ flex: 1 }}>
                <label className="modal-label" style={{ color: theme.foreground }}>
                  Instance Name
                </label>
                <input
                  type="text"
                  className="modal-text-input"
                  style={{
                    background: theme.sidebarAccent,
                    borderColor: theme.border,
                    color: theme.foreground,
                  }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

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
                <div className="icon-picker-tabs">
                  <button
                    type="button"
                    className={`icon-picker-tab-btn ${iconPickerTab === "blocks" ? "active" : ""}`}
                    onClick={() => setIconPickerTab("blocks")}
                  >
                    Block icon ({BLOCK_ICON_KEYS.length})
                  </button>
                  <button
                    type="button"
                    className={`icon-picker-tab-btn ${iconPickerTab === "colors" ? "active" : ""}`}
                    onClick={() => setIconPickerTab("colors")}
                  >
                    Background color ({PASTEL_GRADIENTS.length})
                  </button>
                </div>

                {iconPickerTab === "blocks" ? (
                  <div
                    className="block-picker-grid"
                    style={{ background: "transparent", border: "none", padding: 0 }}
                  >
                    {BLOCK_ICON_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`block-picker-item ${selectedBlock === k ? "selected" : ""}`}
                        onClick={() => setSelectedBlock(k)}
                        title={k.replace(/_/g, " ")}
                      >
                        <img src={getBlockIconSrc(k)} alt={k} className="block-picker-img" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className="gradient-picker-grid"
                    style={{ background: "transparent", border: "none", padding: 0 }}
                  >
                    {PASTEL_GRADIENTS.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        className={`gradient-picker-item ${selectedGradientName === g.name ? "selected" : ""}`}
                        onClick={() => setSelectedGradientName(g.name)}
                        title={g.name}
                      >
                        <div
                          className="gradient-swatch-circle"
                          style={{
                            background: `linear-gradient(180deg, ${g.top} 0%, ${g.bottom} 100%)`,
                          }}
                        />
                        <span className="gradient-swatch-name">{g.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="modal-row-two">
              <div className="modal-field">
                <label className="modal-label" style={{ color: theme.foreground }}>
                  Min Memory (MB)
                </label>
                <input
                  type="number"
                  placeholder="Global default"
                  className="modal-text-input"
                  style={{
                    background: theme.sidebarAccent,
                    borderColor: theme.border,
                    color: theme.foreground,
                  }}
                  value={minMemory}
                  onChange={(e) => setMinMemory(e.target.value)}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label" style={{ color: theme.foreground }}>
                  Max Memory (MB)
                </label>
                <input
                  type="number"
                  placeholder="Global default"
                  className="modal-text-input"
                  style={{
                    background: theme.sidebarAccent,
                    borderColor: theme.border,
                    color: theme.foreground,
                  }}
                  value={maxMemory}
                  onChange={(e) => setMaxMemory(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-field">
              <label className="modal-label" style={{ color: theme.foreground }}>
                Custom Java Binary Path
              </label>
              <input
                type="text"
                placeholder="Leave blank to use managed runtime"
                className="modal-text-input"
                style={{
                  background: theme.sidebarAccent,
                  borderColor: theme.border,
                  color: theme.foreground,
                }}
                value={customJava}
                onChange={(e) => setCustomJava(e.target.value)}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label" style={{ color: theme.foreground }}>
                Extra JVM Arguments
              </label>
              <input
                type="text"
                placeholder="e.g. -XX:+UseG1GC"
                className="modal-text-input"
                style={{
                  background: theme.sidebarAccent,
                  borderColor: theme.border,
                  color: theme.foreground,
                }}
                value={jvmArgs}
                onChange={(e) => setJvmArgs(e.target.value)}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "8px",
              }}
            >
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.destructive}`,
                  color: theme.destructive,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={onDelete}
              >
                Delete Instance
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {savedSuccess && (
                  <span style={{ fontSize: "0.82rem", color: theme.success, fontWeight: 500 }}>
                    Settings saved!
                  </span>
                )}
                <button
                  type="submit"
                  className="modal-confirm-btn"
                  style={{ background: theme.primary, color: theme.primaryForeground }}
                  disabled={saveBusy}
                >
                  {saveBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
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
            className="modal-cancel-btn"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm-btn"
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
