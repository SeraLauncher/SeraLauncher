import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  BUNDLED_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_GC_PRESET,
  DEFAULT_JAVA_OPTIMIZE,
  DEFAULT_JVM_ARGS,
  DEFAULT_MAX_MEMORY,
  DEFAULT_MIN_MEMORY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type FontChoice,
  type GcPreset,
  type JavaRuntime,
  type Settings,
  type Instance,
  type MinecraftVersion,
  type MinecraftVersionsResponse,
  type PublicAccount,
  type DeviceCodeResponse,
  type DownloadItem,
  type DownloadHistoryItem,
} from "@sera/ui";

const DEFAULTS: Settings = {
  appearance: "dark",
  font: BUNDLED_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  javaPath: null,
  minMemory: DEFAULT_MIN_MEMORY,
  maxMemory: DEFAULT_MAX_MEMORY,
  gcPreset: DEFAULT_GC_PRESET,
  javaOptimize: DEFAULT_JAVA_OPTIMIZE,
  jvmArgs: DEFAULT_JVM_ARGS,
};

/** Anything the ui does not recognise is replaced, so a hand-edited or older settings
 *  file can never leave the app without a palette to paint itself. */
const APPEARANCES = ["dark", "light"] as const;
const GC_PRESETS: readonly GcPreset[] = ["none", "g1gc", "zgc"];

function usable(loaded: Partial<Settings>): Settings {
  const appearance = APPEARANCES.find((option) => option === loaded.appearance);
  const minMemory = Number(loaded.minMemory) || DEFAULTS.minMemory;
  const maxMemory = Number(loaded.maxMemory) || DEFAULTS.maxMemory;

  const clampedMin = Math.max(512, Math.min(65536, Math.round(minMemory)));
  const clampedMax = Math.max(clampedMin, Math.min(65536, Math.round(maxMemory)));
  const gcPreset = GC_PRESETS.find((gc) => gc === loaded.gcPreset) ?? DEFAULTS.gcPreset;

  return {
    appearance: appearance ?? DEFAULTS.appearance,
    font: loaded.font?.trim() ? loaded.font : DEFAULTS.font,
    fontSize: Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(Number(loaded.fontSize) || DEFAULTS.fontSize)),
    ),
    javaPath: loaded.javaPath?.trim() ? loaded.javaPath : null,
    minMemory: clampedMin,
    maxMemory: clampedMax,
    gcPreset,
    javaOptimize:
      typeof loaded.javaOptimize === "boolean" ? loaded.javaOptimize : DEFAULTS.javaOptimize,
    jvmArgs: typeof loaded.jvmArgs === "string" ? loaded.jvmArgs : DEFAULTS.jvmArgs,
  };
}

/** Settings live in the rust side of the app, which knows the platform config dir;
 *  load them once and write on every change. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [fonts, setFonts] = useState<readonly FontChoice[]>([BUNDLED_FAMILY]);
  const [javaRuntimes, setJavaRuntimes] = useState<readonly JavaRuntime[]>([]);
  const [systemMemoryMb, setSystemMemoryMb] = useState<number>(8192);

  useEffect(() => {
    let stale = false;
    invoke<Partial<Settings>>("load_settings")
      .then((loaded) => {
        if (!stale) setSettings(usable(loaded));
      })
      .catch((err) => console.warn("sera: could not load settings:", err));
    return () => {
      stale = true;
    };
  }, []);

  // the machine's own font list, with the bundled face kept first
  useEffect(() => {
    let stale = false;
    invoke<string[]>("list_fonts")
      .then((families) => {
        if (!stale) setFonts(families);
      })
      .catch((err) => console.warn("sera: could not list fonts:", err));
    return () => {
      stale = true;
    };
  }, []);

  const refreshJavaRuntimes = useCallback(() => {
    invoke<JavaRuntime[]>("list_java_runtimes")
      .then((runtimes) => setJavaRuntimes(runtimes))
      .catch((err) => console.warn("sera: could not list java runtimes:", err));
  }, []);

  // discover installed Java runtimes across the operating system
  useEffect(() => {
    refreshJavaRuntimes();
  }, [refreshJavaRuntimes]);

  // query total host system memory for allocation sliders
  useEffect(() => {
    let stale = false;
    invoke<number>("get_system_memory")
      .then((mem) => {
        if (!stale && mem > 0) setSystemMemoryMb(mem);
      })
      .catch((err) => console.warn("sera: could not get system memory:", err));
    return () => {
      stale = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      invoke("save_settings", { settings: next }).catch((err) =>
        console.warn("sera: could not save settings:", err),
      );
      return next;
    });
  }, []);

  return { settings, update, fonts, javaRuntimes, systemMemoryMb, refreshJavaRuntimes };
}

export type RunningInstanceInfo = {
  id: string;
  name: string;
  mcVersion: string;
  startedAt: number;
};

export function useInstances() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningInstances, setRunningInstances] = useState<RunningInstanceInfo[]>([]);

  const refreshInstances = useCallback(() => {
    invoke<Instance[]>("list_instances")
      .then((list) => setInstances(list))
      .catch((err) => console.warn("sera: could not list instances:", err));
  }, []);

  const refreshRunningInstances = useCallback(() => {
    invoke<RunningInstanceInfo[]>("get_running_instances")
      .then((res) => setRunningInstances(res))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshInstances();
    refreshRunningInstances();

    let unlistenRunning: (() => void) | null = null;
    let unlistenInstances: (() => void) | null = null;

    listen<RunningInstanceInfo[]>("running_instances_changed", (event) => {
      setRunningInstances(event.payload);
      refreshInstances();
    }).then((unsub) => {
      unlistenRunning = unsub;
    });

    listen("instances_changed", () => {
      refreshInstances();
    }).then((unsub) => {
      unlistenInstances = unsub;
    });

    return () => {
      if (unlistenRunning) unlistenRunning();
      if (unlistenInstances) unlistenInstances();
    };
  }, [refreshInstances, refreshRunningInstances]);

  const killInstance = useCallback(
    async (id: string) => {
      try {
        await invoke("kill_instance", { id });
        refreshRunningInstances();
      } catch (err) {
        console.error("Failed to kill instance:", err);
      }
    },
    [refreshRunningInstances],
  );

  useEffect(() => {
    let stale = false;
    invoke<MinecraftVersionsResponse>("get_minecraft_versions")
      .then((res) => {
        if (!stale && res.versions) {
          setVersions(res.versions);
        }
      })
      .catch((err) => console.warn("sera: could not fetch mc versions:", err))
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, []);

  const createInstance = useCallback(
    async (name: string, mcVersion: string, versionType: string, icon?: string | null) => {
      // Trigger creation in background. Rust writes instance.json within 2ms and emits
      // "instances_changed", making the instance appear in the list instantly!
      invoke("create_instance", { name, mcVersion, versionType, icon })
        .then(() => {
          refreshInstances();
        })
        .catch((err) => {
          console.error("Failed to create instance:", err);
          refreshInstances();
        });
      refreshInstances();
    },
    [refreshInstances],
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      await invoke("delete_instance", { id });
      refreshInstances();
    },
    [refreshInstances],
  );

  const updateInstance = useCallback(
    async (instance: Instance) => {
      await invoke("update_instance", { instance });
      refreshInstances();
    },
    [refreshInstances],
  );

  const openFolder = useCallback(async (id: string) => {
    await invoke("open_instance_folder", { id });
  }, []);

  const launchInstance = useCallback(
    async (id: string) => {
      await invoke("launch_instance", { id });
      refreshInstances();
    },
    [refreshInstances],
  );

  return {
    instances,
    versions,
    loading,
    refreshInstances,
    createInstance,
    deleteInstance,
    updateInstance,
    openFolder,
    launchInstance,
    runningInstances,
    killInstance,
    refreshRunningInstances,
  };
}
export function useAccounts() {
  const [activeAccount, setActiveAccount] = useState<PublicAccount | null>(null);
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = useCallback(() => {
    invoke<PublicAccount | null>("get_active_account")
      .then((acc) => setActiveAccount(acc ?? null))
      .catch((err) => console.warn("sera: could not get active account:", err));

    invoke<PublicAccount[]>("get_all_accounts")
      .then((list) => setAccounts(list))
      .catch((err) => console.warn("sera: could not get all accounts:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const selectAccount = useCallback(
    async (id: string) => {
      await invoke("set_active_account", { id });
      refreshAccounts();
    },
    [refreshAccounts],
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await invoke("remove_account", { id });
      refreshAccounts();
    },
    [refreshAccounts],
  );

  const startMicrosoftLogin = useCallback(async () => {
    return await invoke<DeviceCodeResponse>("start_microsoft_login");
  }, []);

  const pollMicrosoftLogin = useCallback(
    async (deviceCode: string) => {
      const acc = await invoke<PublicAccount>("poll_microsoft_login", { deviceCode });
      refreshAccounts();
      return acc;
    },
    [refreshAccounts],
  );

  const addOfflineAccount = useCallback(
    async (username: string) => {
      const acc = await invoke<PublicAccount>("add_offline_account", { username });
      refreshAccounts();
      return acc;
    },
    [refreshAccounts],
  );

  return {
    activeAccount,
    accounts,
    loading,
    refreshAccounts,
    selectAccount,
    removeAccount,
    startMicrosoftLogin,
    pollMicrosoftLogin,
    addOfflineAccount,
  };
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    invoke<DownloadItem[]>("get_active_downloads")
      .then((active) => {
        if (active) setDownloads(active);
      })
      .catch((err) => console.warn("sera: could not get active downloads:", err));

    listen<DownloadItem[]>("downloads_changed", (event) => {
      setDownloads(event.payload ?? []);
    }).then((unsub) => {
      unlistenFn = unsub;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const pauseDownload = useCallback(async (id: string) => {
    try {
      await invoke("pause_download", { id });
    } catch (err) {
      console.error("Failed to pause download:", err);
    }
  }, []);

  const resumeDownload = useCallback(async (id: string) => {
    try {
      await invoke("resume_download", { id });
    } catch (err) {
      console.error("Failed to resume download:", err);
    }
  }, []);

  const stopDownload = useCallback(async (id: string) => {
    try {
      await invoke("stop_download", { id });
    } catch (err) {
      console.error("Failed to stop download:", err);
    }
  }, []);

  return { downloads, pauseDownload, resumeDownload, stopDownload };
}

const DOWNLOAD_HISTORY_STORAGE_KEY = "sera_download_history";

export function useDownloadHistory(instances: Instance[] = []) {
  const [history, setHistory] = useState<DownloadHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Listen for storage / custom event sync
  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
        if (saved) {
          setHistory(JSON.parse(saved));
        } else {
          setHistory([]);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", handleSync);
    window.addEventListener("sera_download_history_changed", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("sera_download_history_changed", handleSync);
    };
  }, []);

  // When instances arrive, if history in localStorage is completely uninitialized, seed once
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
      if (!saved && instances.length > 0) {
        const initial: DownloadHistoryItem[] = instances.map((inst, idx) => {
          const ts = inst.createdAt
            ? parseInt(inst.createdAt, 10) * 1000
            : Date.now() - (idx + 1) * 3600 * 1000;
          return {
            id: `seed-${inst.id}`,
            instanceName: inst.name,
            instanceIcon: inst.icon,
            mcVersion: inst.mcVersion,
            status: "completed",
            timestamp: ts,
          };
        });
        localStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(initial));
        window.dispatchEvent(new Event("sera_download_history_changed"));
      }
    } catch {
      // ignore
    }
  }, [instances]);

  const addHistoryItem = useCallback((item: DownloadHistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter(
        (h) =>
          h.id !== item.id &&
          h.instanceName.trim().toLowerCase() !== item.instanceName.trim().toLowerCase(),
      );
      const next = [item, ...filtered].slice(0, 50);
      try {
        localStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn("Failed to persist download history:", err);
      }
      return next;
    });
  }, []);

  const removeHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      try {
        localStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn("Failed to update download history:", err);
      }
      return next;
    });
  }, []);

  const clearAllHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(DOWNLOAD_HISTORY_STORAGE_KEY);
    } catch (err) {
      console.warn("Failed to clear download history:", err);
    }
  }, []);

  return {
    history,
    addHistoryItem,
    removeHistoryItem,
    clearAllHistory,
  };
}
