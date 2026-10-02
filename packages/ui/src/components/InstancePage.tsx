import { useMemo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { Modal } from "./ui/modal";
import type { Theme } from "../theme";
import type { Instance, MinecraftVersion } from "../instance";
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
  const [editModalInstance, setEditModalInstance] = useState<Instance | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
                onClick={() => onLaunch(inst)}
                title={`Click to launch ${inst.name}`}
              >
                {/* Floating quick actions */}
                <div className="instance-card-hover-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="instance-card-quick-btn"
                    onClick={() => onOpenFolder(inst.id)}
                    title="Open folder"
                  >
                    <Icon name="folder" size={14} color="#fff" />
                  </button>
                  <button
                    type="button"
                    className="instance-card-quick-btn"
                    onClick={() => setEditModalInstance(inst)}
                    title="Instance settings"
                  >
                    <Icon name="settings" size={14} color="#fff" />
                  </button>
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

      {/* Edit Instance Modal */}
      <AnimatePresence>
        {editModalInstance && (
          <EditInstanceModal
            theme={theme}
            instance={editModalInstance}
            onClose={() => setEditModalInstance(null)}
            onSave={async (updated) => {
              await onUpdateInstance(updated);
              setEditModalInstance(null);
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

/** Modal to edit memory and JVM options for an instance */
function EditInstanceModal({
  theme,
  instance,
  onClose,
  onSave,
}: {
  theme: Theme;
  instance: Instance;
  onClose: () => void;
  onSave: (updated: Instance) => Promise<void>;
}) {
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
  const [busy, setBusy] = useState(false);

  const currentGradient = getPastelGradientByName(selectedGradientName);

  const handleRandomizeIcon = () => {
    setSelectedBlock(getRandomBlockIconKey());
    setSelectedGradientName(getRandomPastelGradientName());
  };

  const handleSave = async () => {
    setBusy(true);
    const updated: Instance = {
      ...instance,
      name: name.trim() || instance.name,
      icon: encodeInstanceIcon(selectedBlock, selectedGradientName),
      minMemory: minMemory ? parseInt(minMemory, 10) || null : null,
      maxMemory: maxMemory ? parseInt(maxMemory, 10) || null : null,
      jvmArgs: jvmArgs.trim() || null,
      customJavaPath: customJava.trim() || null,
    };
    await onSave(updated);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      theme={theme}
      title="Instance Settings"
      maxWidth={480}
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
            style={{ background: theme.primary, color: theme.primaryForeground }}
            onClick={handleSave}
            disabled={busy}
          >
            Save Changes
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
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
    </Modal>
  );
}

/** Modal to confirm deleting an instance */
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
