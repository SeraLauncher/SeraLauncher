import type { Appearance } from "./settings";

/** Palette keys, one entry per colour the ui is allowed to use. */
export type Theme = Record<
  | "background"
  | "shell"
  | "raised"
  | "card"
  | "panel"
  | "text"
  | "muted"
  | "faint"
  | "accent"
  | "danger"
  | "warning"
  | "success",
  string
>;

/** Warm near-black, not neutral gray. Everything sits a few percent warmer than a
 *  standard editor theme so long reading stays soft on the eyes. */
const dark: Theme = {
  /// The rail. Advances off `shell` and carries every sidebar in the app, as well as
  /// the settings boxes.
  background: "#242120",
  /// The page content sits on.
  shell: "#161413",
  raised: "#2b2724",
  card: "#242120",
  /// Panel a boxed group sits on: a hair darker than the rail, so the box separates
  /// from the chrome beside it without going darker than the page.
  panel: "#221f1e",
  text: "#e8e2da",
  muted: "#a79e94",
  faint: "#7d746b",
  accent: "#e0a86a",
  danger: "#e0796a",
  warning: "#d6a544",
  success: "#8bb573",
};

/** Same warmth, inverted: `shell` recedes as the page and `background` advances as the
 *  rail, matching the dark palette's relationship. */
const light: Theme = {
  background: "#f6f2ec",
  shell: "#ebe5dc",
  raised: "#fffdfa",
  card: "#faf6f0",
  /// A hair darker than the rail, matching where the dark palette puts its panel.
  panel: "#f4f0e9",
  text: "#2b2622",
  muted: "#635a52",
  faint: "#8a807a",
  accent: "#a2651f",
  danger: "#b04434",
  warning: "#8a6516",
  success: "#4a7038",
};

export const themes: Record<Appearance, Theme> = { dark, light };

/** the `dark` logo is the variant drawn on a dark shell */
export const logo: Record<Appearance, string> = {
  dark: new URL("./assets/logo/sera-dark.png", import.meta.url).href,
  light: new URL("./assets/logo/sera-light.png", import.meta.url).href,
};

/** The font family inline styles actually ask for. `default` is not a real family, so
 *  an unset preference resolves to the platform ui font. */
export function fontFamily(preference: string | undefined): string {
  if (!preference || preference === "default") return "system-ui";
  return `"${preference}", "Sunghyun Sans", system-ui, sans-serif`;
}
