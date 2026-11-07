import type { Appearance, ThemeId } from "./settings";

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

const defaultDark: Theme = {
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

const defaultLight: Theme = {
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

const catppuccinDark: Theme = {
  background: "#1E1E2E",
  foreground: "#CDD6F4",
  card: "#262637",
  cardForeground: "#CDD6F4",
  popover: "#262637",
  popoverForeground: "#CDD6F4",
  primary: "#CBA6F7",
  primaryForeground: "#1E1E2E",
  secondary: "#313244",
  secondaryForeground: "#CDD6F4",
  muted: "#313244",
  mutedForeground: "#A2A6C1",
  accent: "#313244",
  accentForeground: "#CDD6F4",
  destructive: "#F38BA8",
  destructiveForeground: "#1E1E2E",
  border: "#45475A",
  input: "#313244",
  ring: "#B4BEFE",
  radius: "0.5rem",
  sidebar: "#181825",
  sidebarForeground: "#CDD6F4",
  sidebarPrimary: "#CBA6F7",
  sidebarPrimaryForeground: "#181825",
  sidebarAccent: "#262637",
  sidebarAccentForeground: "#CDD6F4",
  sidebarBorder: "#2A2A3C",
  sidebarRing: "#B4BEFE",
  success: "#1F7D42",

  shell: "#1E1E2E",
  raised: "#313244",
  panel: "#262637",
  text: "#CDD6F4",
  faint: "#A2A6C1",
  danger: "#F38BA8",
  warning: "#F9E2AF",
};

const catppuccinLight: Theme = {
  background: "#EFF1F5",
  foreground: "#4C4F69",
  card: "#E6E9EF",
  cardForeground: "#4C4F69",
  popover: "#E6E9EF",
  popoverForeground: "#4C4F69",
  primary: "#8839EF",
  primaryForeground: "#EFF1F5",
  secondary: "#CCD0DA",
  secondaryForeground: "#4C4F69",
  muted: "#CCD0DA",
  mutedForeground: "#5C5F6D",
  accent: "#CCD0DA",
  accentForeground: "#4C4F69",
  destructive: "#D20F39",
  destructiveForeground: "#EFF1F5",
  border: "#BCC0CC",
  input: "#CCD0DA",
  ring: "#7287FD",
  radius: "0.5rem",
  sidebar: "#E6E9EF",
  sidebarForeground: "#4C4F69",
  sidebarPrimary: "#8839EF",
  sidebarPrimaryForeground: "#EFF1F5",
  sidebarAccent: "#CCD0DA",
  sidebarAccentForeground: "#4C4F69",
  sidebarBorder: "#D4D8E2",
  sidebarRing: "#7287FD",
  success: "#2F8429",

  shell: "#EFF1F5",
  raised: "#E6E9EF",
  panel: "#E6E9EF",
  text: "#4C4F69",
  faint: "#5C5F6D",
  danger: "#D20F39",
  warning: "#DF8E1D",
};

const rosePineDark: Theme = {
  background: "#191724",
  foreground: "#E0DEF4",
  card: "#1F1D2E",
  cardForeground: "#E0DEF4",
  popover: "#1F1D2E",
  popoverForeground: "#E0DEF4",
  primary: "#C4A7E7",
  primaryForeground: "#191724",
  secondary: "#26233A",
  secondaryForeground: "#E0DEF4",
  muted: "#26233A",
  mutedForeground: "#9891B5",
  accent: "#26233A",
  accentForeground: "#E0DEF4",
  destructive: "#EB6F92",
  destructiveForeground: "#191724",
  border: "#403D52",
  input: "#26233A",
  ring: "#C4A7E7",
  radius: "0.5rem",
  sidebar: "#191724",
  sidebarForeground: "#E0DEF4",
  sidebarPrimary: "#C4A7E7",
  sidebarPrimaryForeground: "#191724",
  sidebarAccent: "#26233A",
  sidebarAccentForeground: "#E0DEF4",
  sidebarBorder: "#2B2744",
  sidebarRing: "#C4A7E7",
  success: "#20804D",

  shell: "#191724",
  raised: "#26233A",
  panel: "#1F1D2E",
  text: "#E0DEF4",
  faint: "#9891B5",
  danger: "#EB6F92",
  warning: "#F6C177",
};

const rosePineLight: Theme = {
  background: "#FAF4ED",
  foreground: "#575279",
  card: "#FFFAF3",
  cardForeground: "#575279",
  popover: "#FFFAF3",
  popoverForeground: "#575279",
  primary: "#286983",
  primaryForeground: "#FAF4ED",
  secondary: "#F2E9E1",
  secondaryForeground: "#575279",
  muted: "#F2E9E1",
  mutedForeground: "#736F87",
  accent: "#F2E9E1",
  accentForeground: "#575279",
  destructive: "#A4516B",
  destructiveForeground: "#FAF4ED",
  border: "#E0DCD8",
  input: "#F2E9E1",
  ring: "#907AA9",
  radius: "0.5rem",
  sidebar: "#FAF4ED",
  sidebarForeground: "#575279",
  sidebarPrimary: "#286983",
  sidebarPrimaryForeground: "#FAF4ED",
  sidebarAccent: "#F2E9E1",
  sidebarAccentForeground: "#575279",
  sidebarBorder: "#ECE5DB",
  sidebarRing: "#907AA9",
  success: "#357951",

  shell: "#FAF4ED",
  raised: "#FFFAF3",
  panel: "#F2E9E1",
  text: "#575279",
  faint: "#736F87",
  danger: "#A4516B",
  warning: "#EA9D34",
};

const darkPlusDark: Theme = {
  background: "#1E1E1E",
  foreground: "#CCCCCC",
  card: "#252526",
  cardForeground: "#CCCCCC",
  popover: "#252526",
  popoverForeground: "#CCCCCC",
  primary: "#569CD6",
  primaryForeground: "#141414",
  secondary: "#2D2D30",
  secondaryForeground: "#CCCCCC",
  muted: "#2D2D30",
  mutedForeground: "#9D9D9D",
  accent: "#2D2D30",
  accentForeground: "#CCCCCC",
  destructive: "#F14C4C",
  destructiveForeground: "#1E1E1E",
  border: "#3C3C3C",
  input: "#313131",
  ring: "#4FC1FF",
  radius: "0.5rem",
  sidebar: "#252526",
  sidebarForeground: "#CCCCCC",
  sidebarPrimary: "#569CD6",
  sidebarPrimaryForeground: "#141414",
  sidebarAccent: "#2D2D30",
  sidebarAccentForeground: "#CCCCCC",
  sidebarBorder: "#333333",
  sidebarRing: "#4FC1FF",
  success: "#0F7D38",

  shell: "#1E1E1E",
  raised: "#2D2D30",
  panel: "#252526",
  text: "#CCCCCC",
  faint: "#9D9D9D",
  danger: "#F14C4C",
  warning: "#CCA700",
};

const darkPlusLight: Theme = {
  background: "#FFFFFF",
  foreground: "#3B3B3B",
  card: "#F8F8F8",
  cardForeground: "#3B3B3B",
  popover: "#F8F8F8",
  popoverForeground: "#3B3B3B",
  primary: "#005FB8",
  primaryForeground: "#FFFFFF",
  secondary: "#E4E4E4",
  secondaryForeground: "#3B3B3B",
  muted: "#E4E4E4",
  mutedForeground: "#616161",
  accent: "#E4E4E4",
  accentForeground: "#3B3B3B",
  destructive: "#CD3131",
  destructiveForeground: "#FFFFFF",
  border: "#D4D4D4",
  input: "#E9E9E9",
  ring: "#0092D8",
  radius: "0.5rem",
  sidebar: "#F8F8F8",
  sidebarForeground: "#3B3B3B",
  sidebarPrimary: "#005FB8",
  sidebarPrimaryForeground: "#FFFFFF",
  sidebarAccent: "#E9E9E9",
  sidebarAccentForeground: "#3B3B3B",
  sidebarBorder: "#E4E4E4",
  sidebarRing: "#0092D8",
  success: "#107C10",

  shell: "#FFFFFF",
  raised: "#F3F3F3",
  panel: "#F8F8F8",
  text: "#3B3B3B",
  faint: "#616161",
  danger: "#CD3131",
  warning: "#C5A000",
};

const draculaDark: Theme = {
  background: "#282A36",
  foreground: "#F8F8F2",
  card: "#343746",
  cardForeground: "#F8F8F2",
  popover: "#343746",
  popoverForeground: "#F8F8F2",
  primary: "#BD93F9",
  primaryForeground: "#282A36",
  secondary: "#44475A",
  secondaryForeground: "#F8F8F2",
  muted: "#44475A",
  mutedForeground: "#A9ADC8",
  accent: "#44475A",
  accentForeground: "#F8F8F2",
  destructive: "#FF5555",
  destructiveForeground: "#282A36",
  border: "#4A4D63",
  input: "#44475A",
  ring: "#FF79C6",
  radius: "0.5rem",
  sidebar: "#21222C",
  sidebarForeground: "#F8F8F2",
  sidebarPrimary: "#BD93F9",
  sidebarPrimaryForeground: "#21222C",
  sidebarAccent: "#343746",
  sidebarAccentForeground: "#F8F8F2",
  sidebarBorder: "#2F3140",
  sidebarRing: "#FF79C6",
  success: "#148249",

  shell: "#282A36",
  raised: "#44475A",
  panel: "#343746",
  text: "#F8F8F2",
  faint: "#A9ADC8",
  danger: "#FF5555",
  warning: "#FFB86C",
};

const draculaLight: Theme = {
  background: "#F8F8F2",
  foreground: "#525564",
  card: "#EAEAE3",
  cardForeground: "#525564",
  popover: "#EAEAE3",
  popoverForeground: "#525564",
  primary: "#5D5A80",
  primaryForeground: "#F8F8F2",
  secondary: "#E3E3DB",
  secondaryForeground: "#525564",
  muted: "#E3E3DB",
  mutedForeground: "#64677A",
  accent: "#E3E3DB",
  accentForeground: "#525564",
  destructive: "#C8424E",
  destructiveForeground: "#F8F8F2",
  border: "#D9D9D1",
  input: "#E3E3DB",
  ring: "#8867C7",
  radius: "0.5rem",
  sidebar: "#EFEFE7",
  sidebarForeground: "#525564",
  sidebarPrimary: "#5D5A80",
  sidebarPrimaryForeground: "#F8F8F2",
  sidebarAccent: "#E3E3DB",
  sidebarAccentForeground: "#525564",
  sidebarBorder: "#E0E0D8",
  sidebarRing: "#8867C7",
  success: "#2F855A",

  shell: "#F8F8F2",
  raised: "#EAEAE3",
  panel: "#EAEAE3",
  text: "#525564",
  faint: "#64677A",
  danger: "#C8424E",
  warning: "#B7791F",
};

const tokyoNightDark: Theme = {
  background: "#1A1B26",
  foreground: "#C0CAF5",
  card: "#1F2335",
  cardForeground: "#C0CAF5",
  popover: "#1F2335",
  popoverForeground: "#C0CAF5",
  primary: "#7AA2F7",
  primaryForeground: "#16161E",
  secondary: "#2F334D",
  secondaryForeground: "#C0CAF5",
  muted: "#2F334D",
  mutedForeground: "#9AA5CE",
  accent: "#2F334D",
  accentForeground: "#C0CAF5",
  destructive: "#F7768E",
  destructiveForeground: "#1A1B26",
  border: "#3B4261",
  input: "#2F334D",
  ring: "#BB9AF7",
  radius: "0.5rem",
  sidebar: "#16161E",
  sidebarForeground: "#C0CAF5",
  sidebarPrimary: "#7AA2F7",
  sidebarPrimaryForeground: "#16161E",
  sidebarAccent: "#1F2335",
  sidebarAccentForeground: "#C0CAF5",
  sidebarBorder: "#292E42",
  sidebarRing: "#BB9AF7",
  success: "#2C7F4B",

  shell: "#1A1B26",
  raised: "#2F334D",
  panel: "#1F2335",
  text: "#C0CAF5",
  faint: "#9AA5CE",
  danger: "#F7768E",
  warning: "#E0AF68",
};

const tokyoNightLight: Theme = {
  background: "#E1E2E7",
  foreground: "#3760BF",
  card: "#EAEAF2",
  cardForeground: "#3760BF",
  popover: "#EAEAF2",
  popoverForeground: "#3760BF",
  primary: "#2458B8",
  primaryForeground: "#FFFFFF",
  secondary: "#C4C8DA",
  secondaryForeground: "#3760BF",
  muted: "#C4C8DA",
  mutedForeground: "#52619A",
  accent: "#C4C8DA",
  accentForeground: "#3760BF",
  destructive: "#D3355C",
  destructiveForeground: "#FFFFFF",
  border: "#B4B7CC",
  input: "#C4C8DA",
  ring: "#2E7DE9",
  radius: "0.5rem",
  sidebar: "#D5D7E2",
  sidebarForeground: "#3760BF",
  sidebarPrimary: "#2458B8",
  sidebarPrimaryForeground: "#FFFFFF",
  sidebarAccent: "#C4C8DA",
  sidebarAccentForeground: "#3760BF",
  sidebarBorder: "#C0C3D6",
  sidebarRing: "#2E7DE9",
  success: "#587539",

  shell: "#E1E2E7",
  raised: "#EAEAF2",
  panel: "#EAEAF2",
  text: "#3760BF",
  faint: "#52619A",
  danger: "#D3355C",
  warning: "#9A4E00",
};

/** Every shipped palette, painted in both appearances. */
const themes: Record<Appearance, Theme> = { dark: defaultDark, light: defaultLight };

/** Unknown ids fall back to the flagship palette in `resolveTheme`, so a hand-edited or
 *  older settings file never leaves the app without something to paint. */
export const THEMES: Record<ThemeId, Record<Appearance, Theme>> = {
  default: themes,
  catppuccin: { dark: catppuccinDark, light: catppuccinLight },
  rose_pine: { dark: rosePineDark, light: rosePineLight },
  dark_plus: { dark: darkPlusDark, light: darkPlusLight },
  dracula: { dark: draculaDark, light: draculaLight },
  tokyo_night: { dark: tokyoNightDark, light: tokyoNightLight },
};

export const THEME_LABELS: Record<ThemeId, string> = {
  default: "Sera",
  catppuccin: "Catppuccin",
  rose_pine: "Rosé Pine",
  dark_plus: "Dark+",
  dracula: "Dracula",
  tokyo_night: "Tokyo Night",
};

/** Paints one appearance of one theme. */
export function resolveTheme(id: string | undefined, appearance: Appearance): Theme {
  return THEMES[(id as ThemeId) ?? "default"]?.[appearance] ?? themes[appearance];
}

/** the `dark` logo is the variant drawn on a dark shell */
export const logo: Record<Appearance, string> = {
  dark: new URL("./assets/logo/sera-dark.png", import.meta.url).href,
  light: new URL("./assets/logo/sera-light.png", import.meta.url).href,
};

/** The font family inline styles actually ask for. `default` is not a real family, so
 *  an unset preference resolves to the platform ui font. */
export function fontFamily(preference: string | undefined): string {
  if (!preference || preference === "default" || preference === "Sunghyun Sans") {
    return '"Sunghyun Sans", system-ui, -apple-system, sans-serif';
  }
  return `"${preference}", "Sunghyun Sans", system-ui, sans-serif`;
}
