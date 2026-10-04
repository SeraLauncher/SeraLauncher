import { motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import { fade, snappy } from "../motion";
import type { Appearance } from "../settings";
import type { Theme } from "../theme";

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
}: {
  value: Appearance;
  onChange: (appearance: Appearance) => void;
  theme: Theme;
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
          <Swatch appearance={option} />
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

/** A miniature of the app in one palette: the rail on the left, the page on the right,
 *  a few lines standing in for content. */
function Swatch({ appearance }: { appearance: Appearance }) {
  const swatch =
    appearance === "dark"
      ? { page: "#352B2D", rail: "#44373A", line: "#4B3D43", strong: "#F1DBC2" }
      : { page: "#DFC8B1", rail: "#F1DBC2", line: "#ECD6BD", strong: "#352B2D" };

  return (
    <span
      className="relative flex w-full aspect-[16/10] overflow-hidden border-2 border-transparent rounded-md transition-colors duration-120 group-hover:border-muted-foreground"
      style={{ background: swatch.page }}
    >
      <span
        className="flex flex-col gap-[9%] w-[30%] px-[5%] py-[12%]"
        style={{ background: swatch.rail }}
      >
        <span className="h-[8%] rounded-[2px]" style={{ background: swatch.line }} />
        <span className="h-[8%] rounded-[2px]" style={{ background: swatch.line }} />
        <span className="h-[8%] rounded-[2px] w-[72%]" style={{ background: swatch.line }} />
      </span>
      <span className="flex flex-1 flex-col gap-[9%] px-[10%] py-[14%]">
        <span className="h-[8%] rounded-[2px] w-[97%]" style={{ background: swatch.strong }} />
        <span className="h-[8%] rounded-[2px] w-[88%]" style={{ background: swatch.line }} />
        <span className="h-[8%] rounded-[2px] w-[88%]" style={{ background: swatch.line }} />
        <span className="h-[8%] rounded-[2px] w-[72%]" style={{ background: swatch.line }} />
      </span>
    </span>
  );
}
