import { motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import { railLabel } from "../motion";
import type { Theme } from "../theme";

/** Contents of the open rail: the page's own tab and the way back. The logo sits in
 *  the rail shell and never moves, so the wordmark here is the only thing the open
 *  rail adds. */
export function PageHeader({
  icon,
  label,
  theme,
  onBack,
}: {
  icon: IconName;
  label: string;
  theme: Theme;
  onBack: () => void;
}) {
  return (
    <div className="rail-contents">
      <motion.div
        className="rail-tab"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
        style={{ background: theme.raised }}
      >
        <Icon name={icon} size={20} color={theme.accent} />
        <motion.span
          animate={{ color: theme.accent }}
          style={{ fontSize: "1.05rem", fontWeight: 600 }}
        >
          {label}
        </motion.span>
      </motion.div>

      <motion.button
        type="button"
        onClick={onBack}
        className="back"
        style={{ color: theme.muted }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
      >
        <Icon name="arrowLeft" size={18} color={theme.muted} />
        <span>Back</span>
      </motion.button>
    </div>
  );
}
