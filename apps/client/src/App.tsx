import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AppHeader,
  APP_VERSION,
  HomePage,
  NAV,
  RAIL_WIDTH,
  RailIcons,
  RailLogo,
  SettingsPage,
  SettingsRailNav,
  fade,
  fontFamily,
  pageFade,
  rail,
  railLabel,
  themes,
  type Appearance,
  type SettingsTab,
} from "@sera/ui";
import { useSettings } from "./store";

/** the settings item is last in NAV, so its index is the settings page */
const SETTINGS = NAV.length - 1;

/** the open rail, wide enough for a wordmark beside the logo */
const OPEN_WIDTH = 200;

export default function App() {
  const { settings, update, fonts, javaRuntimes, systemMemoryMb, refreshJavaRuntimes } =
    useSettings();
  const [page, setPage] = useState(0);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");

  const theme = themes[settings.appearance];
  const open = page === SETTINGS;

  // the favicon follows the shell, the same pair the rail picks between
  useEffect(() => {
    document.documentElement.dataset.appearance = settings.appearance;
    if (settings.appearance === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.appearance]);

  return (
    // `user` honours the os setting, so reduced-motion users get fades without the
    // sliding and scaling
    <MotionConfig reducedMotion="user">
      <div
        className="app"
        style={
          {
            // react does not emit css custom properties from a style object, so each
            // palette entry is spelled with the leading dashes for the `var(--x)` in
            // the stylesheet to resolve
            ...Object.fromEntries(
              Object.entries(theme).flatMap(([key, value]) => {
                const kebab = key.replace(/([A-Z])/g, "-$1").toLowerCase();
                return [
                  [`--${key}`, value],
                  [`--${kebab}`, value],
                ];
              }),
            ),
            fontFamily: fontFamily(settings.font),
            fontSize: settings.fontSize,
            color: theme.foreground,
            background: theme.background,
          } as React.CSSProperties
        }
      >
        {/* the rail is one element for the whole app: going to settings widens it,
            coming back narrows it, and the page beside it never moves */}
        <motion.nav
          className="rail"
          animate={{ width: open ? OPEN_WIDTH : RAIL_WIDTH }}
          transition={rail}
          style={{ background: theme.sidebar }}
        >
          {/* the logo is pinned to the rail and never moves between pages; only the
              wordmark beside it comes and goes */}
          <div className="rail-brand">
            <RailLogo appearance={settings.appearance} />
            <AnimatePresence>
              {open && (
                <motion.div
                  key="wordmark"
                  className="rail-wordmark-wrapper"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={railLabel}
                >
                  <span className="rail-wordmark" style={{ color: theme.sidebarForeground }}>
                    Sera
                  </span>
                  <span className="rail-version" style={{ color: theme.mutedForeground }}>
                    v{APP_VERSION}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div key="open" {...pageFade} transition={fade} className="rail-inner">
                <SettingsRailNav
                  activeTab={settingsTab}
                  onSelectTab={setSettingsTab}
                  theme={theme}
                  onBack={() => setPage(0)}
                />
              </motion.div>
            ) : (
              <motion.div key="icons" {...pageFade} transition={fade} className="rail-inner">
                <RailIcons selected={page} onSelect={setPage} theme={theme} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.nav>

        <div className="content-area" style={{ background: theme.sidebar }}>
          <AppHeader
            theme={theme}
            appearance={settings.appearance}
            onToggleTheme={() =>
              update({ appearance: settings.appearance === "dark" ? "light" : "dark" })
            }
          />

          <div className="page-viewport" style={{ background: theme.background }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.main key={NAV[page].label} {...pageFade} transition={fade} className="page">
                {open ? (
                  <SettingsPage
                    activeTab={settingsTab}
                    settings={settings}
                    fonts={fonts}
                    theme={theme}
                    javaRuntimes={javaRuntimes}
                    systemMemoryMb={systemMemoryMb}
                    onFont={(font) => update({ font })}
                    onFontSize={(fontSize) => update({ fontSize })}
                    onAppearance={(appearance: Appearance) => update({ appearance })}
                    onJavaPath={(javaPath) => update({ javaPath })}
                    onMemory={(minMemory, maxMemory) => update({ minMemory, maxMemory })}
                    onGcPreset={(gcPreset) => update({ gcPreset })}
                    onJavaOptimize={(javaOptimize) => update({ javaOptimize })}
                    onJvmArgs={(jvmArgs) => update({ jvmArgs })}
                    onRefreshJava={refreshJavaRuntimes}
                  />
                ) : page === 0 ? (
                  <HomePage theme={theme} />
                ) : (
                  <>
                    <h1>{NAV[page].label}</h1>
                    <p className="page-note">
                      {NAV[page].label} is empty for now. The rail and palette are the parts to
                      build on.
                    </p>
                  </>
                )}
              </motion.main>
            </AnimatePresence>
          </div>
        </div>

        {/* a wash over the swap, so a scheme change cross-fades instead of cutting.
            keyed on the appearance, motion replays it on every change and leaves it
            transparent. */}
        <motion.div
          aria-hidden="true"
          className="scheme-wash"
          key={`wash-${settings.appearance}`}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={fade}
        />
      </div>
    </MotionConfig>
  );
}
