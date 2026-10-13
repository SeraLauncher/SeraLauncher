import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Icon } from "./Icon";
import { Modal } from "./ui/modal";
import { Badge } from "./ui/badge";
import type { Theme } from "../theme";
import type { Instance, ServerEntry, ServerPingResult } from "../instance";

interface InstanceServersTabProps {
  theme: Theme;
  instance: Instance;
  onOpenFolder: (subfolder?: string) => Promise<void>;
  onLaunchServer?: (serverAddress: string) => void;
}

export function InstanceServersTab({
  theme,
  instance,
  onOpenFolder,
  onLaunchServer,
}: InstanceServersTabProps) {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pings, setPings] = useState<Record<string, ServerPingResult>>({});
  const [pinging, setPinging] = useState<Record<string, boolean>>({});

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerEntry | null>(null);
  const [deleteConfirmServer, setDeleteConfirmServer] = useState<ServerEntry | null>(null);

  // Form state
  const [serverName, setServerName] = useState("");
  const [serverAddress, setServerAddress] = useState("");

  const pingSingleServer = useCallback(async (address: string) => {
    setPinging((prev) => ({ ...prev, [address]: true }));
    try {
      const res = await invoke<ServerPingResult>("ping_minecraft_server", { address });
      setPings((prev) => ({ ...prev, [address]: res }));
    } catch {
      // Offline / unreachable
      setPings((prev) => ({
        ...prev,
        [address]: {
          motd: "Cannot connect to server",
          versionName: "Offline",
          protocol: 0,
          playersOnline: 0,
          playersMax: 0,
          pingMs: 0,
          favicon: null,
        },
      }));
    } finally {
      setPinging((prev) => ({ ...prev, [address]: false }));
    }
  }, []);

  const refreshServers = useCallback(async () => {
    try {
      const list = await invoke<ServerEntry[]>("get_instance_servers", { id: instance.id });
      const current = list || [];
      setServers(current);

      for (const s of current) {
        pingSingleServer(s.ip);
      }
    } catch (err) {
      console.warn("Failed to load servers.dat:", err);
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [instance.id, pingSingleServer]);

  useEffect(() => {
    let active = true;
    invoke<ServerEntry[]>("get_instance_servers", { id: instance.id })
      .then((list) => {
        if (!active) return;
        const current = list || [];
        setServers(current);
        for (const s of current) {
          pingSingleServer(s.ip);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to load servers.dat:", err);
        setServers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instance.id, pingSingleServer]);

  const handleSaveServersList = async (updated: ServerEntry[]) => {
    try {
      await invoke("save_instance_servers", {
        id: instance.id,
        servers: updated,
      });
      setServers(updated);
    } catch (err) {
      toast.error(`Failed to save servers.dat: ${err}`);
    }
  };

  const handleAddServer = async () => {
    if (!serverName.trim() || !serverAddress.trim()) return;
    const name = serverName.trim();
    const ip = serverAddress.trim();

    const newEntry: ServerEntry = {
      id: `${name}:${ip}`,
      name,
      ip,
      icon: null,
      acceptTextures: 1,
    };

    const next = [...servers, newEntry];
    await handleSaveServersList(next);
    setShowAddModal(false);
    setServerName("");
    setServerAddress("");
    toast.success(`Server "${name}" added`);
    pingSingleServer(ip);
    refreshServers();
  };

  const handleEditServer = async () => {
    if (!editingServer || !serverName.trim() || !serverAddress.trim()) return;
    const name = serverName.trim();
    const ip = serverAddress.trim();

    const next = servers.map((s) => {
      if (s.ip === editingServer.ip && s.name === editingServer.name) {
        return { ...s, name, ip, id: `${name}:${ip}` };
      }
      return s;
    });

    await handleSaveServersList(next);
    setEditingServer(null);
    setServerName("");
    setServerAddress("");
    toast.success("Server updated");
    pingSingleServer(ip);
    refreshServers();
  };

  const handleDeleteServer = async () => {
    if (!deleteConfirmServer) return;
    const target = deleteConfirmServer;
    const next = servers.filter((s) => !(s.ip === target.ip && s.name === target.name));
    await handleSaveServersList(next);
    setDeleteConfirmServer(null);
    toast.success(`Server "${target.name}" removed`);
    refreshServers();
  };

  const openAddModal = () => {
    setServerName("Minecraft Server");
    setServerAddress("");
    setShowAddModal(true);
  };

  const openEditModal = (s: ServerEntry) => {
    setEditingServer(s);
    setServerName(s.name);
    setServerAddress(s.ip);
  };

  return (
    <div className="flex flex-col gap-4 p-5 min-h-full">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-3 w-full flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <span className="font-semibold text-foreground">
            {servers.length} {servers.length === 1 ? "Server" : "Servers"} configured
          </span>
          <span>in servers.dat</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              for (const s of servers) {
                pingSingleServer(s.ip);
              }
              toast.info("Refreshing server status...");
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-semibold cursor-pointer hover:bg-card transition-colors select-none"
            style={{ color: theme.foreground }}
            title="Re-ping all servers"
          >
            <Icon name="refresh" size={13} color="currentColor" />
            <span>Refresh Status</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-bold cursor-pointer shadow-sm transition-all hover:brightness-110 active:scale-98 select-none"
            style={{ background: theme.primary, color: theme.primaryForeground }}
          >
            <Icon name="plus" size={13} color="currentColor" />
            <span>Add Server</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenFolder()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none"
            style={{ color: theme.foreground }}
            title="Open game directory"
          >
            <Icon name="folder" size={14} color="currentColor" />
            <span>Folder</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col gap-3 w-full">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="p-4 rounded-2xl border border-border bg-card/50 flex gap-3.5 items-center animate-pulse"
            >
              <div className="size-16 rounded-xl bg-secondary shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <div className="h-4 w-1/4 rounded bg-secondary" />
                <div className="h-3 w-1/3 rounded bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="p-12 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-center">
          <div className="size-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Icon name="server" size={24} color="currentColor" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">No saved servers found</span>
            <span className="text-xs text-muted-foreground max-w-sm">
              Add your favorite multiplayer servers here to check live status, player counts, and
              join directly with one click.
            </span>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all hover:brightness-110 select-none mt-2"
            style={{ background: theme.primary, color: theme.primaryForeground }}
          >
            <Icon name="plus" size={13} color="currentColor" />
            <span>Add Your First Server</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          {servers.map((s) => {
            const ping = pings[s.ip];
            const isPinging = pinging[s.ip];
            const isOnline = ping && ping.versionName !== "Offline";
            const pingLatency = ping?.pingMs ?? 0;
            const latencyColor =
              pingLatency < 80 ? "#22c55e" : pingLatency < 180 ? "#eab308" : "#ef4444";

            return (
              <div
                key={`${s.name}:${s.ip}`}
                className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-4 transition-all hover:border-border/80"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Server Icon */}
                  <div className="size-16 rounded-xl shrink-0 overflow-hidden border border-black/15 shadow-sm flex items-center justify-center bg-black/40">
                    {ping?.favicon || s.icon ? (
                      <img
                        src={ping?.favicon || s.icon!}
                        alt={s.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center bg-secondary text-primary">
                        <Icon name="server" size={26} color="currentColor" />
                      </div>
                    )}
                  </div>

                  {/* Server Details */}
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground truncate">{s.name}</span>

                      {/* Status / Player Count Badge */}
                      {isPinging ? (
                        <span className="text-[10px] text-muted-foreground animate-pulse font-mono">
                          Pinging...
                        </span>
                      ) : isOnline ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: latencyColor,
                              display: "inline-block",
                            }}
                          />
                          <Badge variant="environment" className="font-mono text-[10px]">
                            {ping.playersOnline} / {ping.playersMax}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {ping.pingMs}ms
                          </span>
                        </div>
                      ) : (
                        <Badge
                          variant="environment"
                          className="bg-rose-500/15 text-rose-400 border-rose-500/30"
                        >
                          Offline
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono text-[11px] text-foreground/80">{s.ip}</span>
                      {isOnline && (
                        <>
                          <span>•</span>
                          <span className="text-[11px] opacity-80">{ping.versionName}</span>
                        </>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground m-0 line-clamp-1">
                      {ping?.motd || "A Minecraft Server"}
                    </p>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {onLaunchServer && (
                    <button
                      type="button"
                      onClick={() => onLaunchServer(s.ip)}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-bold text-white cursor-pointer shadow-sm transition-all hover:brightness-110 active:scale-95 select-none"
                      style={{ background: theme.success }}
                      title="Launch Minecraft and join this server directly"
                    >
                      <Icon name="play" size={13} color="#ffffff" />
                      <span>Join</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(s)}
                    className="size-8 rounded-lg border border-border bg-secondary flex items-center justify-center cursor-pointer hover:bg-card transition-colors text-muted-foreground hover:text-foreground"
                    title="Edit server name or address"
                  >
                    <Icon name="edit" size={13} color="currentColor" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirmServer(s)}
                    className="size-8 rounded-lg border border-border flex items-center justify-center cursor-pointer hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove server"
                  >
                    <Icon name="trash" size={14} color="currentColor" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Server Modal */}
      {showAddModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddModal(false)}
          theme={theme}
          title="Add Server"
          maxWidth={460}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer transition-all hover:brightness-108 disabled:opacity-50 select-none"
                style={{ background: theme.primary, color: theme.primaryForeground }}
                onClick={handleAddServer}
                disabled={!serverName.trim() || !serverAddress.trim()}
              >
                Save Server
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3 py-1 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Server Name
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="e.g. Nomad Survival"
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                style={{ background: theme.sidebarAccent, color: theme.foreground }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Server Address
              </label>
              <input
                type="text"
                value={serverAddress}
                onChange={(e) => setServerAddress(e.target.value)}
                placeholder="e.g. nomad.aak.bar or mc.hypixel.net:25565"
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                style={{ background: theme.sidebarAccent, color: theme.foreground }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Server Modal */}
      {editingServer && (
        <Modal
          isOpen={true}
          onClose={() => setEditingServer(null)}
          theme={theme}
          title="Edit Server"
          maxWidth={460}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setEditingServer(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer transition-all hover:brightness-108 disabled:opacity-50 select-none"
                style={{ background: theme.primary, color: theme.primaryForeground }}
                onClick={handleEditServer}
                disabled={!serverName.trim() || !serverAddress.trim()}
              >
                Update Server
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3 py-1 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Server Name
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                style={{ background: theme.sidebarAccent, color: theme.foreground }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Server Address
              </label>
              <input
                type="text"
                value={serverAddress}
                onChange={(e) => setServerAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                style={{ background: theme.sidebarAccent, color: theme.foreground }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Server Confirmation Modal */}
      {deleteConfirmServer && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmServer(null)}
          theme={theme}
          title="Remove Server"
          maxWidth={420}
          footer={
            <>
              <button
                type="button"
                className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
                style={{ color: theme.mutedForeground }}
                onClick={() => setDeleteConfirmServer(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer bg-destructive text-white hover:brightness-110 select-none"
                onClick={handleDeleteServer}
              >
                Remove
              </button>
            </>
          }
        >
          <p className="text-xs leading-relaxed m-0" style={{ color: theme.foreground }}>
            Remove server <strong>{deleteConfirmServer.name}</strong> ({deleteConfirmServer.ip})
            from your saved servers list?
          </p>
        </Modal>
      )}
    </div>
  );
}
