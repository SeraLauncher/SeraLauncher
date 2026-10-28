import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AccountModal,
  AppHeader,
  AppLoadingScreen,
  APP_VERSION,
  CommandPalette,
  HomePage,
  InstancePage,
  DiscoveryPage,
  NAV,
  RAIL_WIDTH,
  RailIcons,
  RailLogo,
  SettingsPage,
  SettingsRailNav,
  InstanceRailNav,
  type DiscoveryCategory,
  type InstanceManagementTab,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  fade,
  fontFamily,
  pageFade,
  rail,
  railLabel,
  themes,
  type Appearance,
  type SettingsTab,
  toast,
} from "@sera/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings, useInstances, useAccounts, useDownloads, useDownloadHistory } from "./store";

/** the settings item is last in NAV, so its index is the settings page */
const SETTINGS = NAV.length - 1;

/** the open rail, wide enough for a wordmark beside the logo */
const OPEN_WIDTH = 200;

/** the page the user is browsing in discovery, mapped to a presence status */
const DISCOVERY_STATUS: Record<DiscoveryCategory, string> = {
  modpack: "Searching Modpacks",
  mods: "Searching Mods",
  resourcepack: "Searching Resource Packs",
  shader: "Searching Shaders",
};

/** the instance management tab the user is browsing, mapped to a status fragment */
const INSTANCE_TAB_STATUS: Record<InstanceManagementTab, string> = {
  overview: "Overview",
  mods: "Mods",
  resourcepacks: "Resource Packs",
  shaders: "Shaders",
  worlds: "Worlds",
  servers: "Servers",
  screenshots: "Screenshots",
  settings: "Settings",
};

/** the settings tab the user is browsing, mapped to a status fragment */
const SETTINGS_TAB_STATUS: Record<SettingsTab, string> = {
  appearance: "Appearance",
  java: "Java",
};

export default function App() {
  const { settings, update, fonts, javaRuntimes, systemMemoryMb, refreshJavaRuntimes } =
    useSettings();
  const {
    instances,
    versions,
    createInstance,
    deleteInstance,
    updateInstance,
    openFolder,
    launchInstance,
    runningInstances,
    killInstance,
  } = useInstances();
  const {
    activeAccount,
    accounts,
    selectAccount,
    removeAccount,
    startMicrosoftLogin,
    pollMicrosoftLogin,
    addOfflineAccount,
    loginElyBy,
    loginLittleSkin,
  } = useAccounts();
  const { downloads, pauseDownload, resumeDownload, stopDownload } = useDownloads();
  const {
    history: downloadHistory,
    addHistoryItem,
    removeHistoryItem,
    clearAllHistory,
  } = useDownloadHistory(instances);

  const handleStopDownload = async (id: string) => {
    const item = downloads.find((d) => d.id === id);
    await stopDownload(id);
    if (item) {
      addHistoryItem({
        id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        instanceName: item.instanceName || item.title,
        instanceIcon: item.instanceIcon,
        status: "canceled",
        timestamp: Date.now(),
      });
    }
  };

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(20);

  useEffect(() => {
    // Smooth, progressive startup animation that resolves once initial data is loaded
    const step1 = setTimeout(() => setLoadingProgress(55), 100);
    const step2 = setTimeout(() => setLoadingProgress(85), 250);
    const step3 = setTimeout(() => {
      setLoadingProgress(100);
      setTimeout(() => setAppReady(true), 180);
    }, 450);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
    };
  }, []);
  const [loginReason, setLoginReason] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [managingInstanceId, setManagingInstanceId] = useState<string | null>(null);
  const [instanceTab, setInstanceTab] = useState<InstanceManagementTab>("overview");
  const [discoveryCategory, setDiscoveryCategory] = useState<DiscoveryCategory>("modpack");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // the discord presence reflects launcher navigation; a running game always keeps
  // precedence on the backend, so only pages 0/1/2/settings need reporting here
  useEffect(() => {
    let status: string | null = null;
    if (settings.discordRpc && settings.discordDetailed) {
      if (page === 1) {
        status = managingInstanceId
          ? `Looking at instance ${INSTANCE_TAB_STATUS[instanceTab]}`
          : "Finding some instance";
      } else if (page === 2) {
        status = DISCOVERY_STATUS[discoveryCategory];
      } else if (page === SETTINGS) {
        status = `Looking at ${SETTINGS_TAB_STATUS[settingsTab]} settings`;
      }
    }
    invoke("set_discord_navigation", { status }).catch((err) =>
      console.warn("sera: could not report navigation:", err),
    );
  }, [
    page,
    settingsTab,
    instanceTab,
    managingInstanceId,
    discoveryCategory,
    settings.discordRpc,
    settings.discordDetailed,
  ]);

  // Global shortcuts listener for Command Palette (Ctrl+K) and UI Zoom (Ctrl+Shift+-/+)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Zoom in shortcut: Ctrl/Cmd + Shift + Plus / Equal / NumpadAdd
      const isZoomIn =
        (e.shiftKey && (e.key === "+" || e.key === "=" || e.code === "Equal")) ||
        e.key === "+" ||
        e.code === "NumpadAdd";

      // Zoom out shortcut: Ctrl/Cmd + Shift + Minus / Underscore / NumpadSubtract
      const isZoomOut =
        (e.shiftKey && (e.key === "_" || e.key === "-" || e.code === "Minus")) ||
        e.key === "-" ||
        e.code === "NumpadSubtract";

      // Zoom reset shortcut: Ctrl/Cmd + 0 or Ctrl/Cmd + Shift + 0
      const isZoomReset =
        (e.shiftKey && (e.key === ")" || e.key === "0" || e.code === "Digit0")) ||
        e.key === "0" ||
        e.code === "Numpad0";

      if (isZoomIn) {
        e.preventDefault();
        update({ zoom: Math.min(MAX_ZOOM, settings.zoom + 5) });
      } else if (isZoomOut) {
        e.preventDefault();
        update({ zoom: Math.max(MIN_ZOOM, settings.zoom - 5) });
      } else if (isZoomReset) {
        e.preventDefault();
        update({ zoom: DEFAULT_ZOOM });
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [settings.zoom, update]);

  // Sync zoom setting to document element for proportional application scaling
  useEffect(() => {
    document.documentElement.style.zoom = `${settings.zoom}%`;
  }, [settings.zoom]);

  const theme = themes[settings.appearance];
  const isRailOpen = page === SETTINGS || (page === 1 && Boolean(managingInstanceId));

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
        className="relative flex h-full overflow-hidden select-none"
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
            color: theme.foreground,
            background: theme.background,
          } as React.CSSProperties
        }
      >
        {/* the rail is one element for the whole app: going to settings widens it,
            coming back narrows it, and the page beside it never moves */}
        <motion.nav
          className="relative z-30 shrink-0 flex flex-col items-center gap-2 pt-4 px-2.5 pb-3"
          animate={{ width: isRailOpen ? OPEN_WIDTH : RAIL_WIDTH }}
          transition={rail}
          style={{ background: theme.sidebar }}
        >
          {/* the logo is pinned to the rail and never moves between pages; only the
              wordmark beside it comes and goes */}
          <div className="flex items-center gap-3 w-full h-[30px] pl-[9px]">
            <RailLogo appearance={settings.appearance} />
            <AnimatePresence>
              {isRailOpen && (
                <motion.div
                  key="wordmark"
                  className="inline-flex items-baseline gap-[7px] whitespace-nowrap"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={railLabel}
                >
                  <span
                    className="text-[0.95rem] font-bold whitespace-nowrap"
                    style={{ color: theme.sidebarForeground }}
                  >
                    Sera
                  </span>
                  <span
                    className="text-[0.72rem] font-normal tracking-[0.02em] opacity-85 whitespace-nowrap"
                    style={{ color: theme.mutedForeground }}
                  >
                    v{APP_VERSION}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {isRailOpen ? (
              <motion.div
                key={page === 1 ? `instance-rail-${managingInstanceId}` : "settings-rail"}
                {...pageFade}
                transition={fade}
                className="flex flex-1 flex-col w-full min-h-0"
              >
                {page === 1 && managingInstanceId ? (
                  <InstanceRailNav
                    activeTab={instanceTab}
                    onSelectTab={setInstanceTab}
                    theme={theme}
                    onBack={() => setManagingInstanceId(null)}
                  />
                ) : (
                  <SettingsRailNav
                    activeTab={settingsTab}
                    onSelectTab={setSettingsTab}
                    theme={theme}
                    onBack={() => setPage(0)}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="icons"
                {...pageFade}
                transition={fade}
                className="flex flex-1 flex-col w-full min-h-0"
              >
                <RailIcons
                  selected={page}
                  onSelect={(p) => {
                    setManagingInstanceId(null);
                    setPage(p);
                  }}
                  theme={theme}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.nav>

        <div
          className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-sidebar"
          style={{ background: theme.sidebar }}
        >
          <AppHeader
            theme={theme}
            appearance={settings.appearance}
            account={
              activeAccount
                ? {
                    username: activeAccount.username,
                    uuid: activeAccount.uuid,
                    skinUrl: activeAccount.skinUrl ?? undefined,
                  }
                : null
            }
            onToggleTheme={() =>
              update({ appearance: settings.appearance === "dark" ? "light" : "dark" })
            }
            runningInstances={runningInstances}
            downloads={downloads}
            onKillInstance={killInstance}
            onAccountClick={() => {
              setLoginReason(null);
              setShowAccountModal(true);
            }}
            downloadHistory={downloadHistory}
            onPauseDownload={pauseDownload}
            onResumeDownload={resumeDownload}
            onStopDownload={handleStopDownload}
            onDeleteHistoryItem={removeHistoryItem}
            onClearAllHistory={clearAllHistory}
          />

          <div
            className="flex-1 min-w-0 min-h-0 h-full relative bg-background rounded-tl-[14px] overflow-hidden"
            style={{ background: theme.background }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={
                  page === 1 && managingInstanceId
                    ? `instance-${managingInstanceId}`
                    : NAV[page].label
                }
                {...pageFade}
                animate={{ opacity: 1 }}
                exit={pageFade.exit}
                transition={fade}
                className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto [&>h1]:mt-6 [&>h1]:mx-5 [&>h1]:mb-0"
              >
                {page === SETTINGS ? (
                  <SettingsPage
                    activeTab={settingsTab}
                    settings={settings}
                    fonts={fonts}
                    theme={theme}
                    javaRuntimes={javaRuntimes}
                    systemMemoryMb={systemMemoryMb}
                    onFont={(font) => update({ font })}
                    onZoom={(zoom) => update({ zoom })}
                    onAppearance={(appearance: Appearance) => update({ appearance })}
                    onJavaPath={(javaPath) => update({ javaPath })}
                    onMemory={(minMemory, maxMemory) => update({ minMemory, maxMemory })}
                    onGcPreset={(gcPreset) => update({ gcPreset })}
                    onJavaOptimize={(javaOptimize) => update({ javaOptimize })}
                    onJvmArgs={(jvmArgs) => update({ jvmArgs })}
                    onRefreshJava={refreshJavaRuntimes}
                    onDiscordRpc={(discordRpc) => update({ discordRpc })}
                    onDiscordDetailed={(discordDetailed) => update({ discordDetailed })}
                  />
                ) : page === 0 ? (
                  <HomePage
                    theme={theme}
                    instances={instances.map((i) => i.name)}
                    skinUrl={activeAccount?.skinUrl ?? undefined}
                    username={activeAccount?.username}
                    onNavigateToInstances={() => setPage(1)}
                    onLaunch={async (instanceName) => {
                      if (!activeAccount) {
                        setLoginReason("launch_required");
                        setShowAccountModal(true);
                        return;
                      }
                      const target = instances.find((i) => i.name === instanceName);
                      if (target) {
                        await launchInstance(target.id);
                      }
                    }}
                  />
                ) : page === 1 ? (
                  <InstancePage
                    theme={theme}
                    instances={instances}
                    versions={versions}
                    javaRuntimes={javaRuntimes as any}
                    systemMemoryMb={systemMemoryMb}
                    onRefreshJava={refreshJavaRuntimes}
                    managingInstanceId={managingInstanceId}
                    onSelectManagingInstanceId={setManagingInstanceId}
                    activeManagementTab={instanceTab}
                    onSelectManagementTab={setInstanceTab}
                    runningInstances={runningInstances}
                    onKillInstance={killInstance}
                    onCreateInstance={async (
                      name,
                      mcVersion,
                      versionType,
                      icon,
                      loader,
                      loaderVersion,
                    ) => {
                      const histId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                      try {
                        await createInstance(
                          name,
                          mcVersion,
                          versionType,
                          icon,
                          loader,
                          loaderVersion,
                        );
                        addHistoryItem({
                          id: histId,
                          instanceName: name,
                          instanceIcon: icon,
                          mcVersion,
                          status: "completed",
                          timestamp: Date.now(),
                        });
                      } catch (err) {
                        const isCancelled =
                          typeof err === "string" &&
                          (err.includes("cancel") || err.includes("stopped"));
                        addHistoryItem({
                          id: histId,
                          instanceName: name,
                          instanceIcon: icon,
                          mcVersion,
                          status: isCancelled ? "canceled" : "failed",
                          timestamp: Date.now(),
                        });
                      }
                      refreshJavaRuntimes();
                    }}
                    onDeleteInstance={async (id) => {
                      if (managingInstanceId === id) {
                        setManagingInstanceId(null);
                      }
                      await deleteInstance(id);
                      toast.success("Instance deleted permanently");
                    }}
                    onUpdateInstance={async (updated) => {
                      const res = await updateInstance(updated);
                      const targetId = res?.id || updated.id;
                      if (managingInstanceId && managingInstanceId !== targetId) {
                        setManagingInstanceId(targetId);
                      }
                    }}
                    onOpenFolder={openFolder}
                    onLaunch={async (inst) => {
                      if (!activeAccount) {
                        setLoginReason("launch_required");
                        setShowAccountModal(true);
                        return;
                      }
                      await launchInstance(inst.id);
                    }}
                  />
                ) : page === 2 ? (
                  <DiscoveryPage
                    theme={theme}
                    instances={instances}
                    versions={versions}
                    onCategoryChange={setDiscoveryCategory}
                  />
                ) : (
                  <>
                    <h1>{NAV[page].label}</h1>
                    <p className="mt-2 mx-5 mb-0 text-muted-foreground text-[0.85rem]">
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
          className="absolute inset-0 bg-background pointer-events-none z-40"
          key={`wash-${settings.appearance}`}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={fade}
        />
      </div>
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setLoginReason(null);
        }}
        theme={theme}
        account={activeAccount}
        accounts={accounts}
        onSelectAccount={selectAccount}
        onRemoveAccount={removeAccount}
        onAddOfflineAccount={addOfflineAccount}
        onLoginElyBy={loginElyBy}
        onLoginLittleSkin={loginLittleSkin}
        onStartDeviceFlow={startMicrosoftLogin}
        onPollDeviceFlow={pollMicrosoftLogin}
        onOpenUrl={async (url) => {
          try {
            await openUrl(url);
          } catch {
            window.open(url, "_blank");
          }
        }}
        loginReason={loginReason}
      />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        theme={theme}
        appearance={settings.appearance}
        instances={instances}
        onNavigatePage={(p) => {
          setManagingInstanceId(null);
          setPage(p);
        }}
        onNavigateSettingsTab={(tab) => {
          setSettingsTab(tab);
        }}
        onSelectInstance={(id) => {
          setManagingInstanceId(id);
          setInstanceTab("overview");
        }}
        onLaunchInstance={async (inst) => {
          if (!activeAccount) {
            setLoginReason("launch_required");
            setShowAccountModal(true);
            return;
          }
          await launchInstance(inst.id);
        }}
        onToggleTheme={() =>
          update({ appearance: settings.appearance === "dark" ? "light" : "dark" })
        }
        onOpenAccountModal={() => {
          setLoginReason(null);
          setShowAccountModal(true);
        }}
      />

      <AnimatePresence>
        {!appReady && (
          <AppLoadingScreen
            appearance={settings.appearance}
            theme={theme}
            progress={loadingProgress}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
