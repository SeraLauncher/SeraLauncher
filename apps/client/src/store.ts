import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
