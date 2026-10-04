import { motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import { railLabel } from "../motion";
import type { Theme } from "../theme";

export type SettingsTab = "appearance" | "java";

export interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: IconName;
}

export const SETTINGS_TABS: readonly SettingsNavItem[] = [
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "java", label: "Java & Runtime", icon: "coffee" },
];

/** Contents of the open rail when settings are active: provides category tabs and
 *  the back button to return to launcher pages. */
export function SettingsRailNav({
  tabs = SETTINGS_TABS,
  activeTab,
  onSelectTab,
  theme,
  onBack,
}: {
  tabs?: readonly SettingsNavItem[];
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  theme: Theme;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col min-h-0 w-full">
      <div className="flex flex-col gap-1 mt-2 w-full">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <motion.button
              key={tab.id}
              type="button"
              className="flex items-center gap-2.5 w-full px-2.5 py-2 border-0 rounded-lg text-[0.88rem] font-medium text-left cursor-pointer bg-transparent transition-colors duration-120 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => onSelectTab(tab.id)}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={railLabel}
              style={{
                background: active ? theme.sidebarAccent : "transparent",
                color: active ? theme.sidebarPrimary : theme.mutedForeground,
              }}
            >
              <Icon name={tab.icon} size={18} color="currentColor" />
              <span
                className="whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 mt-auto px-3 py-2 border-0 rounded-lg text-[0.9rem] font-medium text-left cursor-pointer bg-transparent transition-colors duration-120 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        style={{ color: theme.mutedForeground }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
      >
        <Icon name="arrowLeft" size={18} color={theme.mutedForeground} />
        <span>Back</span>
      </motion.button>
    </div>
  );
}

/** Contents of the open rail for single-view drilldowns. */
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
    <div className="flex flex-1 flex-col min-h-0 w-full">
      <motion.div
        className="flex items-center gap-2 mt-1.5 px-2.5 py-2 rounded-lg"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
        style={{ background: theme.sidebarAccent }}
      >
        <Icon name={icon} size={20} color={theme.sidebarPrimary} />
        <motion.span
          animate={{ color: theme.sidebarPrimary }}
          style={{ fontSize: "1.05rem", fontWeight: 600 }}
        >
          {label}
        </motion.span>
      </motion.div>

      <motion.button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 mt-auto px-3 py-2 border-0 rounded-lg text-[0.9rem] font-medium text-left cursor-pointer bg-transparent transition-colors duration-120 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        style={{ color: theme.mutedForeground }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
      >
        <Icon name="arrowLeft" size={18} color={theme.mutedForeground} />
        <span>Back</span>
      </motion.button>
    </div>
  );
}

export type InstanceRailTab =
  | "overview"
  | "mods"
  | "resourcepacks"
  | "shaders"
  | "screenshots"
  | "settings";

export interface InstanceRailNavItem {
  id: InstanceRailTab;
  label: string;
  icon: IconName;
}

export const INSTANCE_RAIL_TABS: readonly InstanceRailNavItem[] = [
  { id: "overview", label: "Overview", icon: "layoutDashboard" },
  { id: "mods", label: "Mods", icon: "puzzle" },
  { id: "resourcepacks", label: "Resource Pack", icon: "palette" },
  { id: "shaders", label: "Shaders", icon: "wand" },
  { id: "screenshots", label: "Screenshots", icon: "photo" },
  { id: "settings", label: "Settings", icon: "settings" },
];

/** Contents of the open rail when an instance is being managed:
 *  provides category tabs and a back button to return to the instance list. */
export function InstanceRailNav({
  tabs = INSTANCE_RAIL_TABS,
  activeTab,
  onSelectTab,
  theme,
  onBack,
}: {
  tabs?: readonly InstanceRailNavItem[];
  activeTab: InstanceRailTab;
  onSelectTab: (tab: InstanceRailTab) => void;
  theme: Theme;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col min-h-0 w-full">
      <div className="flex flex-col gap-1 mt-2 w-full">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <motion.button
              key={tab.id}
              type="button"
              className="flex items-center gap-2.5 w-full px-2.5 py-2 border-0 rounded-lg text-[0.88rem] font-medium text-left cursor-pointer bg-transparent transition-colors duration-120 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => onSelectTab(tab.id)}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={railLabel}
              style={{
                background: active ? theme.sidebarAccent : "transparent",
                color: active ? theme.sidebarPrimary : theme.mutedForeground,
              }}
            >
              <Icon name={tab.icon} size={18} color="currentColor" />
              <span
                className="whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 mt-auto px-3 py-2 border-0 rounded-lg text-[0.9rem] font-medium text-left cursor-pointer bg-transparent transition-colors duration-120 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        style={{ color: theme.mutedForeground }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={railLabel}
      >
        <Icon name="arrowLeft" size={18} color={theme.mutedForeground} />
        <span>Instances</span>
      </motion.button>
    </div>
  );
}
