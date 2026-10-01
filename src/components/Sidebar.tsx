import { motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import { logo, type Theme } from "../theme";
import { snappy } from "../motion";
import type { Appearance } from "../settings";

/** Width of the collapsed rail: one tap target plus a gutter. */
export const RAIL_WIDTH = 68;

/** Where an item sits in the rail. */
type Section =
  /** Stacked under the logo. */
  | "main"
  /** Pinned to the bottom, for anything you rarely open. */
  | "footer";

export type NavItem = { icon: IconName; label: string; section: Section };

export const NAV: NavItem[] = [
  { icon: "home", label: "Home", section: "main" },
  { icon: "instance", label: "Instance", section: "main" },
  { icon: "discover", label: "Discover", section: "main" },
  { icon: "settings", label: "Settings", section: "footer" },
];

const at = (section: Section) =>
  NAV.map((item, index) => ({ item, index })).filter((entry) => entry.item.section === section);

/** The rail's logo. Pinned to the shell, so it sits still while the rail's width and
 *  contents change around it. */
export function RailLogo({ appearance }: { appearance: Appearance }) {
  return <img src={logo[appearance]} alt="" width={30} height={30} />;
}

/** The collapsed rail's contents: the icon list floating in the middle, with the foot
 *  pinned to the bottom. The logo lives in the rail shell. */
export function RailIcons({
  selected,
  onSelect,
  theme,
}: {
  selected: number;
  onSelect: (index: number) => void;
  theme: Theme;
}) {
  const button = ({ item, index }: { item: NavItem; index: number }) => (
    <NavButton
      key={item.label}
      item={item}
      selected={index === selected}
      theme={theme}
      onClick={() => onSelect(index)}
    />
  );

  return (
    <div className="rail-icons">
      <div className="rail-icons-main">{at("main").map(button)}</div>
      <div className="rail-icons-footer">{at("footer").map(button)}</div>
    </div>
  );
}

function NavButton({
  item,
  selected,
  theme,
  onClick,
}: {
  item: NavItem;
  selected: boolean;
  theme: Theme;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-label={item.label}
      aria-label={item.label}
      aria-current={selected ? "page" : undefined}
      className="nav-button"
      style={{ background: selected ? theme.raised : "transparent" }}
      whileTap={{ scale: 0.92 }}
      transition={snappy}
    >
      <Icon name={item.icon} size={22} color={selected ? theme.accent : theme.muted} />
    </motion.button>
  );
}
