import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BUNDLED_FAMILY,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type FontChoice,
  type Settings,
} from "./settings";

const DEFAULTS: Settings = {
  appearance: "dark",
  font: BUNDLED_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
};

/** Anything the ui does not recognise is replaced, so a hand-edited or older settings
 *  file can never leave the app without a palette to paint itself. */
const APPEARANCES = ["dark", "light"] as const;

function usable(loaded: Partial<Settings>): Settings {
  const appearance = APPEARANCES.find((option) => option === loaded.appearance);
  return {
    appearance: appearance ?? DEFAULTS.appearance,
    font: loaded.font?.trim() ? loaded.font : DEFAULTS.font,
    fontSize: Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(Number(loaded.fontSize) || DEFAULTS.fontSize)),
    ),
  };
}

/** Settings live in the rust side of the app, which knows the platform config dir;
 *  load them once and write on every change. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [fonts, setFonts] = useState<readonly FontChoice[]>([BUNDLED_FAMILY]);

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

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      invoke("save_settings", { settings: next }).catch((err) =>
        console.warn("sera: could not save settings:", err),
      );
      return next;
    });
  }, []);

  return { settings, update, fonts };
}
