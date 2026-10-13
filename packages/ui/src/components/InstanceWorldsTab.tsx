import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Icon } from "./Icon";
import { Dropdown } from "./Dropdown";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import {
  getBlockIconSrc,
  getPastelGradientByName,
  getRandomBlockIconKey,
  getRandomPastelGradientName,
} from "../blocks";
import type { Theme } from "../theme";
import type { Instance, WorldItem, WorldBackupItem } from "../instance";

import { getCachedWorlds, getCachedWorldBackups, setCachedWorldsData } from "../instanceCache";

interface InstanceWorldsTabProps {
  theme: Theme;
  instance: Instance;
  onOpenFolder: (subfolder?: string) => Promise<void>;
  onLaunchWorld?: (folderName: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatLastPlayed(millis: number): string {
  if (!millis || millis <= 0) return "Never played";
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const d = new Date(millis);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

type WorldSortOption = "recent" | "oldest" | "name_asc" | "name_desc" | "size_desc";

export function InstanceWorldsTab({
  theme,
  instance,
  onOpenFolder,
  onLaunchWorld,
}: InstanceWorldsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"worlds" | "backups">("worlds");
  const cachedWorlds = getCachedWorlds(instance.id);
  const cachedBackups = getCachedWorldBackups(instance.id);
  const [worlds, setWorlds] = useState<WorldItem[]>(() => cachedWorlds ?? []);
  const [backups, setBackups] = useState<WorldBackupItem[]>(() => cachedBackups ?? []);
  const [loading, setLoading] = useState(() => !cachedWorlds);
  const [search, setSearch] = useState("");
  const [sortOption, setSortOption] = useState<WorldSortOption>("recent");

  // Modals & action states
  const [backingUpWorld, setBackingUpWorld] = useState<string | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<WorldBackupItem | null>(null);
  const [deleteWorldConfirm, setDeleteWorldConfirm] = useState<WorldItem | null>(null);
  const [deleteBackupConfirm, setDeleteBackupConfirm] = useState<WorldBackupItem | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(async () => {
    try {
      const [wList, bList] = await Promise.all([
        invoke<WorldItem[]>("get_instance_worlds", { id: instance.id }),
        invoke<WorldBackupItem[]>("get_instance_world_backups", { id: instance.id }),
      ]);
      const w = wList || [];
      const b = bList || [];
      setWorlds(w);
      setBackups(b);
      setCachedWorldsData(instance.id, w, b);
    } catch (err) {
      console.warn("Failed to load instance worlds:", err);
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    let active = true;
    Promise.all([
      invoke<WorldItem[]>("get_instance_worlds", { id: instance.id }),
      invoke<WorldBackupItem[]>("get_instance_world_backups", { id: instance.id }),
    ])
      .then(([wList, bList]) => {
        if (!active) return;
        const w = wList || [];
        const b = bList || [];
        setWorlds(w);
        setBackups(b);
        setCachedWorldsData(instance.id, w, b);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to load instance worlds:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instance.id]);

  const handleCreateBackup = async (folderName: string, worldName: string) => {
    setBackingUpWorld(folderName);
    toast.info(`Creating backup of "${worldName}"...`, {
      description: "Compressing world files into an archive.",
    });

    try {
      const item = await invoke<WorldBackupItem>("create_world_backup", {
        id: instance.id,
        folderName,
      });
      toast.success(`Backup created: ${item.fileName}`, {
        description: `Size: ${formatBytes(item.sizeBytes)}`,
      });
      refreshData();
    } catch (err) {
      toast.error(`Failed to create backup: ${String(err)}`);
    } finally {
      setBackingUpWorld(null);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoringBackup) return;
    const backupName = restoringBackup.fileName;
    setRestoringBackup(null);
    toast.info(`Restoring backup "${backupName}"...`);

    try {
      await invoke("restore_world_backup", {
        id: instance.id,
        backupFileName: backupName,
      });
      toast.success(`World restored from ${backupName}!`);
      refreshData();
    } catch (err) {
      toast.error(`Failed to restore backup: ${String(err)}`);
    }
  };

  const handleDeleteWorld = async () => {
    if (!deleteWorldConfirm) return;
    const folder = deleteWorldConfirm.folderName;
    const name = deleteWorldConfirm.name;
    setDeleteWorldConfirm(null);

    try {
      await invoke("delete_world_save", {
        id: instance.id,
        folderName: folder,
      });
      toast.success(`World "${name}" deleted`);
      refreshData();
    } catch (err) {
      toast.error(`Failed to delete world: ${String(err)}`);
    }
  };

  const handleDeleteBackup = async () => {
    if (!deleteBackupConfirm) return;
    const fname = deleteBackupConfirm.fileName;
    setDeleteBackupConfirm(null);

    try {
      await invoke("delete_world_backup", {
        id: instance.id,
        backupFileName: fname,
      });
      toast.success(`Backup "${fname}" deleted`);
      refreshData();
    } catch (err) {
      toast.error(`Failed to delete backup: ${String(err)}`);
    }
  };

  const handleCloneWorld = async (world: WorldItem) => {
    toast.info(`Cloning world "${world.name}"...`);
    try {
      const cloned = await invoke<WorldItem>("clone_world_save", {
        id: instance.id,
        folderName: world.folderName,
      });
      toast.success(`World duplicated: "${cloned.name}"`);
      refreshData();
    } catch (err) {
      toast.error(`Failed to clone world: ${err}`);
    }
  };

  const handleImportWorld = async () => {
    try {
      const picked = await invoke<string | null>("pick_modpack_file");
      if (picked) {
        setIsImporting(true);
        toast.info("Importing world archive...");
        const item = await invoke<WorldItem>("import_world_zip", {
          id: instance.id,
          zipPath: picked,
        });
        toast.success(`World "${item.name}" imported successfully!`);
        refreshData();
        return;
      }
    } catch {
      // fallback to file input click
    } finally {
      setIsImporting(false);
    }
    fileInputRef.current?.click();
  };

  const filteredWorlds = useMemo(() => {
    let list = [...worlds];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      list = list.filter(
        (w) => w.name.toLowerCase().includes(needle) || w.folderName.toLowerCase().includes(needle),
      );
    }

    switch (sortOption) {
      case "oldest":
        return [...list].sort((a: WorldItem, b: WorldItem) => a.lastPlayed - b.lastPlayed);
      case "name_asc":
        return [...list].sort((a: WorldItem, b: WorldItem) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
      case "name_desc":
        return [...list].sort((a: WorldItem, b: WorldItem) =>
          b.name.localeCompare(a.name, undefined, { numeric: true }),
        );
      case "size_desc":
        return [...list].sort((a: WorldItem, b: WorldItem) => b.sizeBytes - a.sizeBytes);
      case "recent":
      default:
        return [...list].sort((a: WorldItem, b: WorldItem) => b.lastPlayed - a.lastPlayed);
    }
  }, [worlds, search, sortOption]);

  const filteredBackups = useMemo(() => {
    if (!search.trim()) return backups;
    const needle = search.trim().toLowerCase();
    return backups.filter(
      (b) =>
        b.worldName.toLowerCase().includes(needle) || b.fileName.toLowerCase().includes(needle),
    );
  }, [backups, search]);

  const fallbackBlock = useMemo(() => getRandomBlockIconKey(), []);
  const fallbackGradient = useMemo(
    () => getPastelGradientByName(getRandomPastelGradientName()),
    [],
  );

  return (
    <div className="flex flex-col gap-4 p-5 min-h-full">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between gap-3 w-full flex-wrap">
        {/* Left: Search input */}
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card/60 flex-1 min-w-[220px] max-w-[360px] focus-within:border-primary transition-colors">
          <Icon name="search" size={15} color={theme.mutedForeground} />
          <input
            type="text"
            className="flex-1 bg-transparent border-0 text-foreground text-xs outline-none placeholder:text-muted-foreground"
            placeholder={activeSubTab === "worlds" ? "Search worlds..." : "Search backups..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Icon name="reset" size={12} color="currentColor" />
            </button>
          )}
        </div>

        {/* Center: Tabs Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-secondary">
          <button
            type="button"
            onClick={() => setActiveSubTab("worlds")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              activeSubTab === "worlds"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Saves ({worlds.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("backups")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              activeSubTab === "backups"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Backups ({backups.length})
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {activeSubTab === "worlds" && (
            <Dropdown
              value={sortOption}
              options={["recent", "oldest", "name_asc", "name_desc", "size_desc"]}
              render={(opt) => {
                switch (opt) {
                  case "recent":
                    return "Most Recent";
                  case "oldest":
                    return "Oldest";
                  case "name_asc":
                    return "Name (A-Z)";
                  case "name_desc":
                    return "Name (Z-A)";
                  case "size_desc":
                    return "Largest Size";
                  default:
                    return opt;
                }
              }}
              onChange={(opt) => setSortOption(opt as WorldSortOption)}
              theme={theme}
            />
          )}

          <button
            type="button"
            disabled={isImporting}
            onClick={handleImportWorld}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
            style={{ color: theme.foreground }}
            title="Import a world from .zip archive"
          >
            <Icon name="download" size={14} color="currentColor" />
            <span>Import World</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const path = (file as any).path || file.name;
                setIsImporting(true);
                toast.info(`Importing world "${file.name}"...`);
                try {
                  const item = await invoke<WorldItem>("import_world_zip", {
                    id: instance.id,
                    zipPath: path,
                  });
                  toast.success(`World "${item.name}" imported!`);
                  refreshData();
                } catch (err) {
                  toast.error(`Failed to import world: ${String(err)}`);
                } finally {
                  setIsImporting(false);
                }
              }
            }}
          />

          <button
            type="button"
            onClick={() => onOpenFolder(activeSubTab === "worlds" ? "saves" : "backups")}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
            style={{ color: theme.foreground }}
            title={`Open ${activeSubTab === "worlds" ? "saves" : "backups"} directory`}
          >
            <Icon name="folder" size={14} color="currentColor" />
            <span>Folder</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="p-4 rounded-2xl border border-border bg-card/50 flex gap-3.5 items-center animate-pulse"
            >
              <div className="size-16 rounded-xl bg-secondary shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <div className="h-4 w-1/3 rounded bg-secondary" />
                <div className="h-3 w-1/2 rounded bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : activeSubTab === "worlds" ? (
        filteredWorlds.length === 0 ? (
          <div className="p-12 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-center">
            <div className="size-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
              <Icon name="globe" size={24} color="currentColor" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {search ? `No worlds matching "${search}"` : "No singleplayer worlds found"}
              </span>
              <span className="text-xs text-muted-foreground max-w-sm">
                Create a world in Minecraft, or click Import World to load a .zip archive.
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 w-full">
            {filteredWorlds.map((world: WorldItem) => {
              const isBackingUp = backingUpWorld === world.folderName;
              return (
                <div
                  key={world.folderName}
                  className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-4 transition-all hover:border-border/80"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* World Thumbnail */}
                    <div
                      className="size-16 rounded-xl shrink-0 overflow-hidden border border-black/15 shadow-sm flex items-center justify-center"
                      style={{
                        background: world.iconDataUrl
                          ? "#000"
                          : `linear-gradient(180deg, ${fallbackGradient.top} 0%, ${fallbackGradient.bottom} 100%)`,
                      }}
                    >
                      {world.iconDataUrl ? (
                        <img
                          src={world.iconDataUrl}
                          alt={world.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <img
                          src={getBlockIconSrc(fallbackBlock)}
                          alt="World default icon"
                          className="size-10 object-contain drop-shadow-sm"
                        />
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground truncate">
                          {world.name}
                        </span>
                        {world.hardcore ? (
                          <Badge
                            variant="environment"
                            className="bg-red-500/15 text-red-400 border-red-500/30"
                          >
                            Hardcore
                          </Badge>
                        ) : (
                          <Badge variant="environment">{world.gameType}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <span>{world.difficulty}</span>
                        <span>•</span>
                        <span>{formatLastPlayed(world.lastPlayed)}</span>
                        <span>•</span>
                        <span>{formatBytes(world.sizeBytes)}</span>
                        {world.versionName && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] opacity-80">
                              {world.versionName}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/60 truncate">
                        {world.folderName}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onLaunchWorld && (
                      <button
                        type="button"
                        onClick={() => onLaunchWorld(world.folderName)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-white cursor-pointer shadow-sm transition-all hover:brightness-110 active:scale-95 select-none"
                        style={{ background: theme.success }}
                        title="Launch Minecraft and load directly into this world"
                      >
                        <Icon name="play" size={13} color="#ffffff" />
                        <span>Play</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBackingUp}
                      onClick={() => handleCreateBackup(world.folderName, world.name)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
                      style={{ color: theme.foreground }}
                      title="Create an instant ZIP backup of this world"
                    >
                      <Icon name="archive" size={13} color="currentColor" />
                      <span>{isBackingUp ? "Backing up..." : "Backup"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCloneWorld(world)}
                      className="size-8 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-card transition-colors text-muted-foreground hover:text-foreground"
                      title="Duplicate / clone this world save"
                    >
                      <Icon name="copy" size={13} color="currentColor" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteWorldConfirm(world)}
                      className="size-8 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete world save"
                    >
                      <Icon name="trash" size={14} color="currentColor" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : /* Backups Subtab */
      filteredBackups.length === 0 ? (
        <div className="p-12 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="size-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Icon name="archive" size={24} color="currentColor" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">
              {search ? `No backups matching "${search}"` : "No world backups found"}
            </span>
            <span className="text-xs text-muted-foreground max-w-sm">
              Click "Backup" on any save to create a snapshot before modifying mods or updates.
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 w-full">
          {filteredBackups.map((b) => (
            <div
              key={b.fileName}
              className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-secondary flex items-center justify-center text-primary shrink-0">
                  <Icon name="archive" size={18} color="currentColor" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">{b.worldName}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px]">{b.fileName}</span>
                    <span>•</span>
                    <span>{formatBytes(b.sizeBytes)}</span>
                    <span>•</span>
                    <span>{new Date(b.createdAt * 1000).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRestoringBackup(b)}
                  className="inline-flex items-center gap-1.5 h-7.5 px-3 rounded-lg border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
                  style={{ color: theme.foreground }}
                  title="Restore this backup back into the saves directory"
                >
                  <Icon name="refresh" size={12} color="currentColor" />
                  <span>Restore</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteBackupConfirm(b)}
                  className="size-7.5 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete backup archive"
                >
                  <Icon name="trash" size={13} color="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal: Delete World Save */}
      {deleteWorldConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteWorldConfirm(null)}
          theme={theme}
          title="Delete World Save"
          maxWidth={420}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setDeleteWorldConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer bg-destructive text-white hover:brightness-110 select-none"
                onClick={handleDeleteWorld}
              >
                Delete Permanently
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2 py-1 text-xs">
            <p className="text-foreground m-0">
              Are you sure you want to delete world <strong>{deleteWorldConfirm.name}</strong>?
            </p>
            <p className="text-muted-foreground m-0">
              This will remove all world chunks, player inventories, and save files permanently. We
              recommend creating a backup first.
            </p>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Restore Backup */}
      {restoringBackup && (
        <Modal
          isOpen={true}
          onClose={() => setRestoringBackup(null)}
          theme={theme}
          title="Restore World Backup"
          maxWidth={420}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setRestoringBackup(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 select-none"
                style={{ background: theme.primary, color: theme.primaryForeground }}
                onClick={handleRestoreBackup}
              >
                Restore Backup
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2 py-1 text-xs">
            <p className="text-foreground m-0">
              Restore world from <strong>{restoringBackup.fileName}</strong>?
            </p>
            <p className="text-muted-foreground m-0">
              This will extract the backup files into your saves directory, overwriting existing
              files with the same name.
            </p>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete Backup */}
      {deleteBackupConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteBackupConfirm(null)}
          theme={theme}
          title="Delete Backup"
          maxWidth={420}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setDeleteBackupConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer bg-destructive text-white hover:brightness-110 select-none"
                onClick={handleDeleteBackup}
              >
                Delete Backup
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2 py-1 text-xs">
            <p className="text-foreground m-0">
              Are you sure you want to delete backup <strong>{deleteBackupConfirm.fileName}</strong>
              ?
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
