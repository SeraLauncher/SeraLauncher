import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon, type Icon as IconName } from "./Icon";
import type { Theme } from "../theme";
import type { Appearance } from "../settings";
import type { Instance } from "../instance";
import type { SettingsTab } from "./PageHeader";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Instances" | "Actions";
  icon: IconName;
  shortcut?: string;
  badge?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  appearance: Appearance;
  instances: Instance[];
  onNavigatePage: (pageIndex: number) => void;
  onNavigateSettingsTab: (tab: SettingsTab) => void;
  onSelectInstance: (instanceId: string) => void;
  onLaunchInstance: (instance: Instance) => void;
  onToggleTheme: () => void;
  onOpenAccountModal: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  theme,
  appearance,
  instances,
  onNavigatePage,
  onNavigateSettingsTab,
  onSelectInstance,
  onLaunchInstance,
  onToggleTheme,
  onOpenAccountModal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Assemble dynamic list of commands
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Navigation
      {
        id: "nav-home",
        title: "Go to Home",
        subtitle: "Recent activity and quick launch",
        category: "Navigation",
        icon: "home",
        shortcut: "1",
        action: () => {
          onNavigatePage(0);
          onClose();
        },
      },
      {
        id: "nav-instances",
        title: "Go to Instances",
        subtitle: "View and manage all local Minecraft profiles",
        category: "Navigation",
        icon: "instance",
        shortcut: "2",
        action: () => {
          onNavigatePage(1);
          onClose();
        },
      },
      {
        id: "nav-discover",
        title: "Go to Discover",
        subtitle: "Explore mods, modpacks, resource packs, and shaders",
        category: "Navigation",
        icon: "discover",
        shortcut: "3",
        action: () => {
          onNavigatePage(2);
          onClose();
        },
      },
      {
        id: "nav-settings-appearance",
        title: "Settings: Appearance",
        subtitle: "Customize themes, color schemes, and interface typography",
        category: "Navigation",
        icon: "palette",
        action: () => {
          onNavigatePage(3);
          onNavigateSettingsTab("appearance");
          onClose();
        },
      },
      {
        id: "nav-settings-java",
        title: "Settings: Java & Runtime",
        subtitle: "Configure JVM memory limits, garbage collector, and Temurin JDKs",
        category: "Navigation",
        icon: "coffee",
        action: () => {
          onNavigatePage(3);
          onNavigateSettingsTab("java");
          onClose();
        },
      },

      // Actions
      {
        id: "action-toggle-theme",
        title: appearance === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        subtitle: "Toggle between Sera dark and light interface themes",
        category: "Actions",
        icon: appearance === "dark" ? "sun" : "moon",
        shortcut: "T",
        action: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: "action-manage-accounts",
        title: "Account Manager",
        subtitle: "Switch or add Microsoft, Ely.by, LittleSkin, and offline profiles",
        category: "Actions",
        icon: "computer",
        action: () => {
          onOpenAccountModal();
          onClose();
        },
      },
      {
        id: "action-create-instance",
        title: "Create New Instance",
        subtitle: "Install a clean Vanilla, Fabric, Forge, NeoForge, or Quilt instance",
        category: "Actions",
        icon: "plus",
        action: () => {
          onNavigatePage(1);
          onClose();
        },
      },
    ];

    // Instances commands
    for (const inst of instances) {
      items.push({
        id: `instance-open-${inst.id}`,
        title: `Manage ${inst.name}`,
        subtitle: `Minecraft ${inst.mcVersion} · ${inst.loader || "Vanilla"}`,
        category: "Instances",
        icon: "instance",
        badge: inst.mcVersion,
        action: () => {
          onNavigatePage(1);
          onSelectInstance(inst.id);
          onClose();
        },
      });
      items.push({
        id: `instance-play-${inst.id}`,
        title: `Launch ${inst.name}`,
        subtitle: `Quick start ${inst.name} immediately`,
        category: "Instances",
        icon: "play",
        action: () => {
          onLaunchInstance(inst);
          onClose();
        },
      });
    }

    return items;
  }, [
    instances,
    appearance,
    onNavigatePage,
    onNavigateSettingsTab,
    onSelectInstance,
    onLaunchInstance,
    onToggleTheme,
    onOpenAccountModal,
    onClose,
  ]);

  // Filter commands by search term
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q),
    );
  }, [allCommands, query]);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? filteredCommands.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[1200] flex items-start justify-center pt-[14vh] px-4 bg-black/60 backdrop-blur-xs select-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-[560px] rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col"
          style={{ background: theme.card }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Header (Balanced vertical alignment and centered spacing) */}
          <div
            className="flex items-center gap-3 px-4 h-10.5 shrink-0"
            style={{ background: theme.card }}
          >
            <Icon name="search" size={18} color={theme.primary} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search instances..."
              className="flex-1 h-full bg-transparent border-0 outline-none text-sm font-medium leading-normal placeholder:text-muted-foreground flex items-center"
              style={{ color: theme.foreground }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelectedIndex(0);
                }}
                className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Icon name="x" size={13} color="currentColor" />
              </button>
            ) : (
              <kbd
                className="inline-flex items-center justify-center text-[10px] font-mono px-1.5 py-0.5 rounded border-0 text-muted-foreground leading-none"
                style={{ background: theme.background }}
              >
                ESC
              </kbd>
            )}
          </div>

          {/* List Content Container with rounded-xl border radius and subtle gradient masks */}
          <div className="relative w-full flex-1 min-h-0 flex flex-col">
            <div
              className="relative w-full flex-1 min-h-0 overflow-hidden rounded-xl"
              style={{ background: theme.background }}
            >
              {/* Top Fade Gradient: 100% top to 0% bottom */}
              <div
                className="pointer-events-none absolute top-0 left-0 right-0 h-6 z-10"
                style={{
                  background: `linear-gradient(to bottom, ${theme.background}, transparent)`,
                }}
              />

              <div
                ref={listRef}
                className="w-full h-full max-h-[380px] overflow-y-auto px-3 py-2 flex flex-col gap-1"
              >
                {filteredCommands.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    No commands or instances found matching &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  filteredCommands.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        data-index={idx}
                        onClick={() => item.action()}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/20" : "hover:bg-foreground/5"
                        }`}
                        style={{
                          color: theme.foreground,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="size-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{
                              background: theme.secondary,
                            }}
                          >
                            <Icon name={item.icon} size={14} color={theme.primary} />
                          </div>

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold truncate leading-tight">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="text-[11px] truncate opacity-75 leading-tight text-muted-foreground">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {item.badge && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground"
                              style={{
                                background: theme.secondary,
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-60">
                            {item.category}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Fade Gradient: 0% top to 100% bottom */}
              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 z-10"
                style={{
                  background: `linear-gradient(to top, ${theme.background}, transparent)`,
                }}
              />
            </div>
          </div>

          {/* Footer Guide (Balanced vertical alignment and centered spacing) */}
          <div
            className="flex items-center justify-between px-4 h-9 text-[11px] text-muted-foreground select-none shrink-0"
            style={{ background: theme.card }}
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 leading-none">
                <kbd
                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-muted-foreground font-mono text-[9px] border-0 leading-none"
                  style={{ background: theme.background }}
                >
                  ↑
                </kbd>
                <kbd
                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-muted-foreground font-mono text-[9px] border-0 leading-none"
                  style={{ background: theme.background }}
                >
                  ↓
                </kbd>{" "}
                navigate
              </span>
              <span className="flex items-center gap-1 leading-none">
                <kbd
                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-muted-foreground font-mono text-[9px] border-0 leading-none"
                  style={{ background: theme.background }}
                >
                  ↵
                </kbd>{" "}
                select
              </span>
            </div>
            <span className="flex items-center gap-1 leading-none">
              Press{" "}
              <kbd
                className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-muted-foreground font-mono text-[9px] border-0 leading-none"
                style={{ background: theme.background }}
              >
                Ctrl+K
              </kbd>{" "}
              anytime
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
