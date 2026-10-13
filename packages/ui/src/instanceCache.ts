import { invoke } from "@tauri-apps/api/core";
import type { InstalledAddonItem, WorldItem, WorldBackupItem, ScreenshotItem } from "./instance";

export interface InstanceDataCache {
  instanceId: string;
  mods?: InstalledAddonItem[];
  resourcepacks?: InstalledAddonItem[];
  shaders?: InstalledAddonItem[];
  activeResourcePacks?: string[];
  activeShaderPack?: string | null;
  worlds?: WorldItem[];
  worldBackups?: WorldBackupItem[];
  screenshots?: ScreenshotItem[];
}

/** Active in-memory cache for currently managed instance data. */
const activeCaches = new Map<string, InstanceDataCache>();

export function getInstanceCache(instanceId: string): InstanceDataCache | undefined {
  return activeCaches.get(instanceId);
}

export function updateInstanceCache(instanceId: string, partial: Partial<InstanceDataCache>): void {
  const current = activeCaches.get(instanceId) || { instanceId };
  activeCaches.set(instanceId, { ...current, ...partial });
}

export function getCachedAddons(
  instanceId: string,
  category: "mods" | "resourcepack" | "shader",
): InstalledAddonItem[] | undefined {
  const cache = activeCaches.get(instanceId);
  if (!cache) return undefined;
  if (category === "mods") return cache.mods;
  if (category === "resourcepack") return cache.resourcepacks;
  if (category === "shader") return cache.shaders;
  return undefined;
}

export function setCachedAddons(
  instanceId: string,
  category: "mods" | "resourcepack" | "shader",
  items: InstalledAddonItem[],
): void {
  const cache = activeCaches.get(instanceId) || { instanceId };
  if (category === "mods") cache.mods = items;
  else if (category === "resourcepack") cache.resourcepacks = items;
  else if (category === "shader") cache.shaders = items;
  activeCaches.set(instanceId, cache);
}

export function getCachedActiveResourcePacks(instanceId: string): string[] | undefined {
  return activeCaches.get(instanceId)?.activeResourcePacks;
}

export function setCachedActiveResourcePacks(instanceId: string, packs: string[]): void {
  updateInstanceCache(instanceId, { activeResourcePacks: packs });
}

export function getCachedActiveShaderPack(instanceId: string): string | null | undefined {
  return activeCaches.get(instanceId)?.activeShaderPack;
}

export function setCachedActiveShaderPack(instanceId: string, pack: string | null): void {
  updateInstanceCache(instanceId, { activeShaderPack: pack });
}

export function getCachedWorlds(instanceId: string): WorldItem[] | undefined {
  return activeCaches.get(instanceId)?.worlds;
}

export function getCachedWorldBackups(instanceId: string): WorldBackupItem[] | undefined {
  return activeCaches.get(instanceId)?.worldBackups;
}

export function setCachedWorldsData(
  instanceId: string,
  worlds: WorldItem[],
  backups: WorldBackupItem[],
): void {
  updateInstanceCache(instanceId, { worlds, worldBackups: backups });
}

export function getCachedScreenshots(instanceId: string): ScreenshotItem[] | undefined {
  return activeCaches.get(instanceId)?.screenshots;
}

export function setCachedScreenshots(instanceId: string, screenshots: ScreenshotItem[]): void {
  updateInstanceCache(instanceId, { screenshots });
}

/**
 * Purges cached instance data from memory to free resources when returning to the instance list.
 */
export function clearInstanceDataCache(instanceId?: string): void {
  if (instanceId) {
    activeCaches.delete(instanceId);
  } else {
    activeCaches.clear();
  }
}

/**
 * Staggered background preloader for an instance.
 * Asynchronously loads mods, visual packs, worlds, and screenshots
 * so tabs open instantaneously without blocking the overview view.
 * Returns a cancel function to abort pending background timers if the user quickly leaves.
 */
export function preloadInstanceData(instanceId: string): () => void {
  let active = true;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Step 1: Preload mods (highest likelihood tab)
  const t1 = setTimeout(() => {
    if (!active) return;
    invoke<InstalledAddonItem[]>("get_installed_addons_list", {
      instanceId,
      projectType: "mods",
    })
      .then((items) => {
        if (active && items) setCachedAddons(instanceId, "mods", items);
      })
      .catch(() => {});
  }, 10);
  timers.push(t1);

  // Step 2: Preload resource packs & active options
  const t2 = setTimeout(() => {
    if (!active) return;
    Promise.all([
      invoke<InstalledAddonItem[]>("get_installed_addons_list", {
        instanceId,
        projectType: "resourcepack",
      }),
      invoke<string[]>("get_active_resource_packs", { id: instanceId }),
    ])
      .then(([items, activePacks]) => {
        if (active) {
          if (items) setCachedAddons(instanceId, "resourcepack", items);
          if (activePacks) setCachedActiveResourcePacks(instanceId, activePacks);
        }
      })
      .catch(() => {});
  }, 60);
  timers.push(t2);

  // Step 3: Preload shader packs & active shader
  const t3 = setTimeout(() => {
    if (!active) return;
    Promise.all([
      invoke<InstalledAddonItem[]>("get_installed_addons_list", {
        instanceId,
        projectType: "shader",
      }),
      invoke<string | null>("get_active_shader_pack", { id: instanceId }),
    ])
      .then(([items, activeShader]) => {
        if (active) {
          if (items) setCachedAddons(instanceId, "shader", items);
          setCachedActiveShaderPack(instanceId, activeShader ?? null);
        }
      })
      .catch(() => {});
  }, 120);
  timers.push(t3);

  // Step 4: Preload singleplayer worlds & backups
  const t4 = setTimeout(() => {
    if (!active) return;
    Promise.all([
      invoke<WorldItem[]>("get_instance_worlds", { id: instanceId }),
      invoke<WorldBackupItem[]>("get_instance_world_backups", { id: instanceId }),
    ])
      .then(([worlds, backups]) => {
        if (active && worlds) {
          setCachedWorldsData(instanceId, worlds, backups || []);
        }
      })
      .catch(() => {});
  }, 180);
  timers.push(t4);

  // Step 5: Preload screenshots
  const t5 = setTimeout(() => {
    if (!active) return;
    invoke<ScreenshotItem[]>("get_instance_screenshots", { id: instanceId })
      .then((screenshots) => {
        if (active && screenshots) {
          setCachedScreenshots(instanceId, screenshots);
        }
      })
      .catch(() => {});
  }, 240);
  timers.push(t5);

  return () => {
    active = false;
    for (const t of timers) {
      clearTimeout(t);
    }
  };
}
