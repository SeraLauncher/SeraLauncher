/** Current Sera application version. */
export const APP_VERSION = "0.1.4";

/** Which palette the app is painted with. Owned here rather than in `theme.ts` so the
 *  settings store can import it without pulling the palettes in. */
export type Appearance = "dark" | "light";

/** Sunghyun Sans, shipped with the app. */
export const BUNDLED_FAMILY = "Sunghyun Sans";

/** A family name resolved by css. Open, because the list is whatever the machine
 *  has installed rather than a fixed set. */
export type FontChoice = string;

/** Base text size, in css pixels. Everything sized in `rem` scales from it. */
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 20;

/** Supported garbage collection presets for Minecraft runtime execution. */
export type GcPreset = "none" | "g1gc" | "zgc";

export const DEFAULT_GC_PRESET: GcPreset = "g1gc";
export const DEFAULT_JAVA_OPTIMIZE = true;
export const DEFAULT_JVM_ARGS = "";

/** Default memory and runtime flags for Minecraft execution. */
export const DEFAULT_MIN_MEMORY = 2048;
export const DEFAULT_MAX_MEMORY = 4096;

/** Information on an installed Java runtime discovered on the system. */
export type JavaRuntime = {
  path: string;
  version: string;
  majorVersion: number;
  is64Bit: boolean;
};

/** User preferences, persisted as json by the rust side. */
export type Settings = {
  appearance: Appearance;
  font: FontChoice;
  fontSize: number;
  javaPath: string | null;
  minMemory: number;
  maxMemory: number;
  gcPreset: GcPreset;
  javaOptimize: boolean;
  jvmArgs: string;
};

export type ResolvedJavaArgs = {
  memoryArgs: string[];
  gcArgs: string[];
  optimizeArgs: string[];
  customArgs: string[];
  allArgs: string[];
};

export function resolveEffectiveJavaArgs(
  settings: Pick<Settings, "minMemory" | "maxMemory" | "gcPreset" | "javaOptimize" | "jvmArgs">,
): ResolvedJavaArgs {
  const memoryArgs = [`-Xms${settings.minMemory}M`, `-Xmx${settings.maxMemory}M`];

  const gcArgs: string[] = [];
  if (settings.gcPreset === "g1gc") {
    gcArgs.push("-XX:+UseG1GC");
  } else if (settings.gcPreset === "zgc") {
    gcArgs.push("-XX:+UseZGC", "-XX:+ZGenerational");
  }

  const optimizeArgs: string[] = [];
  if (settings.javaOptimize) {
    optimizeArgs.push(
      "-XX:+UnlockExperimentalVMOptions",
      "-XX:+ParallelRefProcEnabled",
      "-XX:+AlwaysPreTouch",
      "-XX:+DisableExplicitGC",
      "-XX:+PerfDisableSharedMem",
    );
    if (settings.gcPreset === "g1gc") {
      optimizeArgs.push(
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:MaxTenuringThreshold=1",
      );
    }
  }

  const customArgs = settings.jvmArgs.trim()
    ? settings.jvmArgs.trim().split(/\s+/).filter(Boolean)
    : [];

  const allArgs = [...memoryArgs, ...gcArgs, ...optimizeArgs, ...customArgs];

  return { memoryArgs, gcArgs, optimizeArgs, customArgs, allArgs };
}
