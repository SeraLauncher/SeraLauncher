import {
  FaDiscord,
  FaGithub,
  FaInstagram,
  FaMicrosoft,
  FaPatreon,
  FaReddit,
  FaSteam,
  FaTelegram,
  FaTiktok,
  FaTwitch,
  FaTwitter,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
export * from "react-icons/fa6";

/** Icons from tabler (MIT).
 *
 *  Inlined as path data so they resolve `currentColor` from this document, which is
 *  what lets one variant serve every colour in the theme. Stroke settings that
 *  tabler repeats on every icon are hoisted into the wrapper svg, so a `d` here is
 *  just geometry. */
const paths = {
  home: [
    "M5 12l-2 0l9 -9l9 9l-2 0",
    "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7",
    "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
  ],
  instance: [
    "M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5",
    "M12 12l8 -4.5",
    "M12 12l0 9",
    "M12 12l-8 -4.5",
  ],
  discover: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0",
    "M3.6 9h16.8",
    "M3.6 15h16.8",
    "M11.5 3a17 17 0 0 0 0 18",
    "M12.5 3a17 17 0 0 1 0 18",
  ],
  palette: [
    "M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0 -3h-1a1.5 1.5 0 0 1 0 -3h2a4.5 4.5 0 0 0 4.5 -4.5c0 -4.142 -4.03 -7.5 -9 -7.5",
    "M7.5 11.5a1 1 0 1 0 0 -2a1 1 0 0 0 0 2",
    "M10.5 7.5a1 1 0 1 0 0 -2a1 1 0 0 0 0 2",
    "M15 7.5a1 1 0 1 0 0 -2a1 1 0 0 0 0 2",
  ],
  sun: [
    "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
    "M3 12h1M12 3v1M20 12h1M12 20v1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7M17.7 18.4l.7 .7M6.3 18.4l-.7 .7",
  ],
  moon: [
    "M12 3a9 9 0 1 0 9 9c0 -.46 -.04 -.92 -.1 -1.36a5.39 5.39 0 0 1 -4.4 2.26a5.4 5.4 0 0 1 -5.4 -5.4c0 -1.81 .9 -3.4 2.26 -4.4c-.44 -.06 -.9 -.1 -1.36 -.1",
  ],
  reset: ["M9 14l-4 -4l4 -4", "M5 10h8a6 6 0 0 1 6 6v4"],
  refresh: ["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"],
  check: ["M5 12l5 5l10 -10"],
  alertCircle: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 8l0 4", "M12 16l.01 0"],
  computer: [
    "M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z",
    "M7 20h10",
    "M9 16v4",
    "M15 16v4",
  ],
  server: [
    "M3 4m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z",
    "M3 12m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z",
    "M7 8l.01 0",
    "M7 16l.01 0",
  ],
  heart: ["M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"],
  arrowLeft: ["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"],
  arrowRight: ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  chevronLeft: ["M15 6l-6 6l6 6"],
  chevronRight: ["M9 6l6 6l-6 6"],
  settings: [
    "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065",
    "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
  ],
  coffee: [
    "M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1",
    "M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2",
    "M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2",
    "M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5z",
    "M16.746 16.726a3 3 0 1 0 .252 -5.555",
  ],
  play: ["M7 4v16l13 -8z"],
  pause: [
    "M6 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
    "M14 5m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z",
  ],
  playerStop: ["M5 5m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"],
  chevronDown: ["M6 9l6 6l6 -6"],
  search: ["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  externalLink: [
    "M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6",
    "M11 13l9 -9",
    "M15 4h5v5",
  ],
  eye: [
    "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
    "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
  ],
  eyeOff: [
    "M10.585 10.587a2 2 0 0 0 2.829 2.828",
    "M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87",
    "M3 3l18 18",
  ],
  dots: [
    "M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
    "M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  ],
  maximize: [
    "M4 8v-2a2 2 0 0 1 2 -2h2",
    "M4 16v2a2 2 0 0 0 2 2h2",
    "M16 4h2a2 2 0 0 1 2 2v2",
    "M16 20h2a2 2 0 0 0 2 -2v-2",
  ],
  minimize: [
    "M5 9h4v-4",
    "M3 3l6 6",
    "M5 15h4v4",
    "M3 21l6 -6",
    "M19 9h-4v-4",
    "M21 3l-6 6",
    "M19 15h-4v4",
    "M21 21l-6 -6",
  ],
  clock: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3"],
  cubes: [
    "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4v-10a4 4 0 0 1 4 -4z",
    "M12 8l0 8",
    "M8.5 10l7 4",
    "M8.5 14l7 -4",
  ],
  puzzle: [
    "M4 7a2 2 0 0 1 2 -2h2a2 2 0 0 0 2 -2a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 1 -2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 0 -2 2a2 2 0 0 1 -2 -2h-2a2 2 0 0 1 -2 -2v-2a2 2 0 0 0 -2 -2a2 2 0 0 1 2 -2v-2z",
  ],
  wand: [
    "M6 21l15 -15l-3 -3l-15 15l3 3",
    "M15 6l3 3",
    "M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2",
    "M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2",
  ],
  photo: [
    "M15 8h.01",
    "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z",
    "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5",
    "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3",
  ],
  layoutDashboard: ["M4 4h6v8h-6z", "M4 16h6v4h-6z", "M14 12h6v8h-6z", "M14 4h6v4h-6z"],
  globe: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0",
    "M3.6 9h16.8",
    "M3.6 15h16.8",
    "M11.5 3a17 17 0 0 0 0 18",
    "M12.5 3a17 17 0 0 1 0 18",
  ],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  copy: [
    "M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z",
    "M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2",
  ],
  plus: ["M12 5l0 14", "M5 12l14 0"],
  folder: ["M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"],
  trash: [
    "M4 7l16 0",
    "M10 11l0 6",
    "M14 11l0 6",
    "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12",
    "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
  ],
  edit: [
    "M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1",
    "M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z",
  ],
  download: ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 11l5 5l5 -5", "M12 4l0 12"],
  loader: ["M12 3a9 9 0 1 0 9 9"],
  sortArrows: ["M3 9l4 -4l4 4m-4 -4v14", "M21 15l-4 4l-4 -4m4 4v-14"],
  filter: [
    "M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.828 4.828v5.586l-4 2v-7.586l-4.828 -4.828a2 2 0 0 1 -.586 -1.414z",
  ],
  user: ["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0", "M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"],
  logout: [
    "M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2",
    "M9 12h12l-3 -3",
    "M18 15l3 -3",
  ],
  brandWindows: [
    "M3 5l8 -1l0 7l-8 0z",
    "M13 3.8l8 -1.1l0 8.3l-8 0z",
    "M3 13l8 0l0 7l-8 -1z",
    "M13 13l8 0l0 8.3l-8 -1.1z",
  ],
} as const;

export const socialIcons = {
  discord: FaDiscord,
  github: FaGithub,
  instagram: FaInstagram,
  microsoft: FaMicrosoft,
  youtube: FaYoutube,
  xTwitter: FaXTwitter,
  twitter: FaTwitter,
  twitch: FaTwitch,
  reddit: FaReddit,
  tiktok: FaTiktok,
  telegram: FaTelegram,
  steam: FaSteam,
  patreon: FaPatreon,
} as const;

export type SocialIconName = keyof typeof socialIcons;

/** Social icon component rendered from Font Awesome 6 */
export function SocialIcon({
  name,
  size = 20,
  color = "currentColor",
  className,
  title,
}: {
  name: SocialIconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}) {
  const Component = socialIcons[name];
  return (
    <Component
      size={size}
      color={color}
      className={`inline-block flex-shrink-0 -translate-y-[1px] ${className ?? ""}`.trim()}
      title={title}
      aria-hidden="true"
    />
  );
}

export type TablerIcon = keyof typeof paths;
export type Icon = TablerIcon | SocialIconName;

/** Unified Icon component: renders Tabler stroked geometry or Font Awesome 6 social icons */
export function Icon({
  name,
  size = 20,
  color,
  className,
}: {
  name: Icon;
  size?: number;
  color: string;
  className?: string;
}) {
  if (name in socialIcons) {
    const SocialComp = socialIcons[name as SocialIconName];
    return <SocialComp size={size} color={color} className={className} aria-hidden="true" />;
  }

  const tablerName = name as TablerIcon;
  const pathList = paths[tablerName];
  if (!pathList) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block flex-shrink-0 -translate-y-[1px] ${className ?? ""}`.trim()}
      aria-hidden="true"
    >
      {pathList.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
