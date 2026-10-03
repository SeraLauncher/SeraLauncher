import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AccountModal,
  AppHeader,
  APP_VERSION,
  HomePage,
  InstancePage,
  NAV,
  RAIL_WIDTH,
  RailIcons,
  RailLogo,
  SettingsPage,
  SettingsRailNav,
  InstanceRailNav,
  type InstanceManagementTab,
  fade,
  fontFamily,
  pageFade,
  rail,
  railLabel,
  themes,
  type Appearance,
  type SettingsTab,
} from "@sera/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings, useInstances, useAccounts, useDownloads, useDownloadHistory } from "./store";

/** the settings item is last in NAV, so its index is the settings page */
const SETTINGS = NAV.length - 1;

/** the open rail, wide enough for a wordmark beside the logo */
const OPEN_WIDTH = 200;

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
  const [loginReason, setLoginReason] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const [managingInstanceId, setManagingInstanceId] = useState<string | null>(null);
  const [instanceTab, setInstanceTab] = useState<InstanceManagementTab>("overview");

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
          animate={{ width: isRailOpen ? OPEN_WIDTH : RAIL_WIDTH }}
          transition={rail}
          style={{ background: theme.sidebar }}
        >
          {/* the logo is pinned to the rail and never moves between pages; only the
              wordmark beside it comes and goes */}
          <div className="rail-brand">
            <RailLogo appearance={settings.appearance} />
            <AnimatePresence>
              {isRailOpen && (
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
            {isRailOpen ? (
              <motion.div
                key={page === 1 ? `instance-rail-${managingInstanceId}` : "settings-rail"}
                {...pageFade}
                transition={fade}
                className="rail-inner"
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
              <motion.div key="icons" {...pageFade} transition={fade} className="rail-inner">
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

        <div className="content-area" style={{ background: theme.sidebar }}>
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

          <div className="page-viewport" style={{ background: theme.background }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={
                  page === 1 && managingInstanceId
                    ? `instance-${managingInstanceId}-${instanceTab}`
                    : NAV[page].label
                }
                {...pageFade}
                transition={fade}
                className="page"
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
                    managingInstanceId={managingInstanceId}
                    onSelectManagingInstanceId={setManagingInstanceId}
                    activeManagementTab={instanceTab}
                    onSelectManagementTab={setInstanceTab}
                    runningInstances={runningInstances}
                    onKillInstance={killInstance}
                    onCreateInstance={async (name, mcVersion, versionType, icon) => {
                      const histId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                      try {
                        await createInstance(name, mcVersion, versionType, icon);
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
                    onDeleteInstance={deleteInstance}
                    onUpdateInstance={updateInstance}
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
    </MotionConfig>
  );
}
