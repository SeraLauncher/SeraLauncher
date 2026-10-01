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

/** User preferences, persisted as json by the rust side. */
export type Settings = {
  appearance: Appearance;
  font: FontChoice;
  fontSize: number;
};
