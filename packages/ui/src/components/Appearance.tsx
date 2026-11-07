import { Fragment } from "react";
import { motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import { fade, snappy } from "../motion";
import { Dropdown } from "./Dropdown";
import { THEME_IDS, type Appearance, type ThemeId } from "../settings";
import { THEMES, THEME_LABELS, resolveTheme, type Theme } from "../theme";

/** Two choices, not three: the app follows the system when no preference is saved. */
const OPTIONS: readonly Appearance[] = ["light", "dark"];

const label: Record<Appearance, string> = { light: "Light", dark: "Dark" };
const icon: Record<Appearance, IconName> = { light: "sun", dark: "moon" };

/** Pick the palette with a picture of it. Each swatch paints itself in its own
 *  colours rather than swapping the whole app, so the choice is visible before it is
 *  made. */
export function AppearancePicker({
  value,
  onChange,
  theme,
  themeId,
}: {
  value: Appearance;
  onChange: (appearance: Appearance) => void;
  theme: Theme;
  themeId: ThemeId;
}) {
  return (
    <div className="flex gap-4 w-full">
      {OPTIONS.map((option) => (
        <motion.button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className="flex flex-1 flex-col items-center gap-2.5 p-1.5 border-0 rounded-[10px] cursor-pointer bg-transparent"
          whileTap={{ scale: 0.98 }}
          transition={snappy}
        >
          <Swatch
            theme={resolveTheme(themeId, option)}
            selected={value === option}
            selectedColor={theme.primary}
          />
          <motion.span
            className="flex items-center gap-1.5 text-[0.9rem] font-medium"
            animate={{
              color: value === option ? theme.primary : theme.mutedForeground,
            }}
            transition={fade}
          >
            <Icon
              name={icon[option]}
              size={15}
              color={value === option ? theme.primary : theme.mutedForeground}
            />
            {label[option]}
          </motion.span>
        </motion.button>
      ))}
    </div>
  );
}

/** Two flat hairline-separated rows — light and dark — each with its own palette
 *  dropdown: a two-tone colour chip beside the palette name, like the rest of the
 *  setting rows. No grid, no box. */
export function ThemePicker({
  lightTheme,
  darkTheme,
  onLight,
  onDark,
  theme,
}: {
  lightTheme: ThemeId;
  darkTheme: ThemeId;
  onLight: (id: ThemeId) => void;
  onDark: (id: ThemeId) => void;
  theme: Theme;
}) {
  const rows = [
    { label: "Light theme", value: lightTheme, onChange: onLight, variant: "light" as const },
    { label: "Dark theme", value: darkTheme, onChange: onDark, variant: "dark" as const },
  ];
  return (
    <div className="flex flex-col w-full">
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          <div
            className="flex items-center justify-between gap-4 py-2.5"
            style={index > 0 ? { borderTop: `1px solid ${theme.border}` } : undefined}
          >
            <span className="text-[0.95rem] font-medium" style={{ color: theme.foreground }}>
              {row.label}
            </span>
            <Dropdown
              className="w-[230px]"
              value={row.value}
              options={THEME_IDS}
              render={(id) => THEME_LABELS[id]}
              renderLeading={(id) => <ThemeChip theme={THEMES[id][row.variant]} />}
              onChange={row.onChange}
              theme={theme}
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Small square chip: page background on the left, accent on the right. */
function ThemeChip({ theme: t }: { theme: Theme }) {
  return (
    <span
      className="shrink-0 w-4 h-4 rounded-[4px]"
      style={{
        background: `linear-gradient(90deg, ${t.background} 0% 50%, ${t.primary} 50% 100%)`,
        boxShadow: `inset 0 0 0 1px ${t.border}`,
      }}
    />
  );
}

/** A miniature of the app in one palette: the rail on the left, the page on the right,
 *  a few lines standing in for content. */
function Swatch({
  theme,
  selected,
  selectedColor,
}: {
  theme: Theme;
  selected?: boolean;
  selectedColor?: string;
}) {
  return (
    <span
      className="relative flex w-full aspect-[16/10] overflow-hidden border-2 rounded-md transition-colors duration-120"
      style={{
        background: theme.background,
        borderColor: selected ? selectedColor : "transparent",
      }}
    >
      <span
        className="flex flex-col gap-[9%] w-[30%] px-[5%] py-[12%]"
        style={{ background: theme.sidebar }}
      >
        <span className="h-[8%] rounded-[2px]" style={{ background: theme.sidebarPrimary }} />
        <span className="h-[8%] rounded-[2px]" style={{ background: theme.border }} />
        <span className="h-[8%] rounded-[2px] w-[72%]" style={{ background: theme.border }} />
      </span>
      <span className="flex flex-1 flex-col gap-[9%] px-[10%] py-[14%]">
        <span className="h-[8%] rounded-[2px] w-[64%]" style={{ background: theme.primary }} />
        <span className="h-[8%] rounded-[2px] w-[88%]" style={{ background: theme.border }} />
        <span className="h-[8%] rounded-[2px] w-[88%]" style={{ background: theme.border }} />
        <span className="h-[8%] rounded-[2px] w-[72%]" style={{ background: theme.border }} />
      </span>
    </span>
  );
}
