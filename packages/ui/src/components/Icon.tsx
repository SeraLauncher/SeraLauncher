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
  arrowLeft: ["M5 12l14 0", "M5 12l6 6", "M5 12l6 -6"],
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
  x: [
    "M18 6l-12 12",
    "M6 6l12 12",
  ],
  copy: [
    "M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z",
    "M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2",
  ],
} as const;

export type Icon = keyof typeof paths;

export function Icon({ name, size = 20, color }: { name: Icon; size?: number; color: string }) {
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
      aria-hidden="true"
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
