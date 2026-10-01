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
    <div className="schemes">
      {OPTIONS.map((option) => (
        <motion.button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className="scheme"
          whileTap={{ scale: 0.98 }}
          transition={snappy}
        >
          <Swatch appearance={option} />
          <motion.span
            className="scheme-label"
            animate={{
              color: value === option ? theme.accent : theme.muted,
            }}
            transition={fade}
          >
            <Icon
              name={icon[option]}
              size={15}
              color={value === option ? theme.accent : theme.muted}
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
      ? { page: "#1c1a19", rail: "#161413", line: "#7d746b", strong: "#a79e94" }
      : { page: "#f6f2ec", rail: "#ebe5dc", line: "#c9c1b8", strong: "#8a807a" };

  return (
    <span className="swatch" style={{ background: swatch.page }}>
      <span className="swatch-rail" style={{ background: swatch.rail }}>
        <span className="swatch-bar" style={{ background: swatch.line }} />
        <span className="swatch-bar" style={{ background: swatch.line }} />
        <span className="swatch-bar swatch-bar-short" style={{ background: swatch.line }} />
      </span>
      <span className="swatch-body">
        <span className="swatch-bar swatch-bar-strong" style={{ background: swatch.strong }} />
        <span className="swatch-bar swatch-bar-mid" style={{ background: swatch.line }} />
        <span className="swatch-bar swatch-bar-mid" style={{ background: swatch.line }} />
        <span className="swatch-bar swatch-bar-short" style={{ background: swatch.line }} />
      </span>
    </span>
  );
}
