import type { Appearance } from "./settings";

/** Palette keys matching standard shadcn CSS variables, plus backwards compatibility aliases. */
export type Theme = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  radius: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  success: string;

  // Compatibility aliases for existing UI code linked directly to new variables:
  shell: string;
  raised: string;
  panel: string;
  text: string;
  faint: string;
  danger: string;
  warning: string;
};

const light: Theme = {
  background: "#DFC8B1",
  foreground: "#352B2D",
  card: "#ECD6BD",
  cardForeground: "#352B2D",
  popover: "#ECD6BD",
  popoverForeground: "#352B2D",
  primary: "#4B3D43",
  primaryForeground: "#F1DBC2",
  secondary: "#F1DBC2",
  secondaryForeground: "#352B2D",
  muted: "#ECD6BD",
  mutedForeground: "#625458",
  accent: "#ECD6BD",
  accentForeground: "#352B2D",
  destructive: "#A64B4B",
  destructiveForeground: "#F1DBC2",
  border: "#CCB7A0",
  input: "#F1DBC2",
  ring: "#857974",
  radius: "0.5rem",
  sidebar: "#F1DBC2",
  sidebarForeground: "#352B2D",
  sidebarPrimary: "#4B3D43",
  sidebarPrimaryForeground: "#F1DBC2",
  sidebarAccent: "#E2C8AE",
  sidebarAccentForeground: "#352B2D",
  sidebarBorder: "#DFC8B1",
  sidebarRing: "#857974",
  success: "#54944C",

  // Compatibility aliases
  shell: "#DFC8B1",
  raised: "#F1DBC2",
  panel: "#ECD6BD",
  text: "#352B2D",
  faint: "#625458",
  danger: "#A64B4B",
  warning: "#857974",
};

const dark: Theme = {
  background: "#352B2D",
  foreground: "#F1DBC2",
  card: "#44373A",
  cardForeground: "#F1DBC2",
  popover: "#44373A",
  popoverForeground: "#F1DBC2",
  primary: "#CCB7A0",
  primaryForeground: "#352B2D",
  secondary: "#4B3D43",
  secondaryForeground: "#DFC8B1",
  muted: "#4B3D43",
  mutedForeground: "#C8B9A6",
  accent: "#4B3D43",
  accentForeground: "#F1DBC2",
  destructive: "#C96A6A",
  destructiveForeground: "#352B2D",
  border: "#524347",
  input: "#4B3D43",
  ring: "#908A7B",
  radius: "0.5rem",
  sidebar: "#44373A",
  sidebarForeground: "#F1DBC2",
  sidebarPrimary: "#CCB7A0",
  sidebarPrimaryForeground: "#352B2D",
  sidebarAccent: "#4B3D43",
  sidebarAccentForeground: "#F1DBC2",
  sidebarBorder: "#4B3D43",
  sidebarRing: "#908A7B",
  success: "#54944C",

  // Compatibility aliases linked to legible, high-contrast values:
  shell: "#352B2D",
  raised: "#4B3D43",
  panel: "#44373A",
  text: "#F1DBC2",
  faint: "#C8B9A6",
  danger: "#C96A6A",
  warning: "#908A7B",
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
