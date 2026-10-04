import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Icon } from "./Icon";
import { MinecraftHead } from "@sera/player-model";
import { Modal } from "./ui/modal";
import type { Theme } from "../theme";
import type { AccountType, DeviceCodeResponse, PublicAccount } from "../account";

interface AccountBadgeConfig {
  label: string;
  bg: string;
  color: string;
}

const FAVICON_CACHE = new Set<string>();

function ProviderFavicon({
  url,
  fallbackIcon,
  size = 14,
}: {
  url: string;
  fallbackIcon: "globe" | "palette";
  size?: number;
}) {
  const [loaded, setLoaded] = useState(() => FAVICON_CACHE.has(url));
  const [failed, setFailed] = useState(false);

  if (failed || (!loaded && !FAVICON_CACHE.has(url))) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
        <Icon name={fallbackIcon} size={size} color="currentColor" />
        <img
          src={url}
          alt=""
          aria-hidden="true"
          style={{ display: "none" }}
          onLoad={() => {
            FAVICON_CACHE.add(url);
            setLoaded(true);
          }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 2,
        objectFit: "contain",
      }}
      onError={() => {
        FAVICON_CACHE.delete(url);
        setFailed(true);
      }}
    />
  );
}

function getBadgeConfig(type: AccountType | undefined, theme: Theme): AccountBadgeConfig {
  switch (type) {
    case "microsoft":
      return { label: "Microsoft", bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444" };
    case "elyby":
      return { label: "Ely.by", bg: "rgba(16, 185, 129, 0.15)", color: "#10b981" };
    case "littleskin":
      return { label: "LittleSkin", bg: "rgba(14, 165, 233, 0.15)", color: "#0ea5e9" };
    case "offline":
    default:
      return { label: "Offline", bg: "rgba(120, 120, 120, 0.18)", color: theme.mutedForeground };
  }
}

function AccountModalDialog({
  onClose,
  theme,
  account,
  accounts = [],
  onSelectAccount,
  onRemoveAccount,
  onAddOfflineAccount,
  onLoginElyBy,
  onLoginLittleSkin,
  onStartDeviceFlow,
  onPollDeviceFlow,
  onOpenUrl,
  loginReason,
}: {
  onClose: () => void;
  theme: Theme;
  account: PublicAccount | null;
  accounts?: PublicAccount[];
  onSelectAccount?: (id: string) => void;
  onRemoveAccount?: (id: string) => void;
  onAddOfflineAccount?: (username: string) => Promise<PublicAccount>;
  onLoginElyBy?: (username: string, password: string) => Promise<PublicAccount>;
  onLoginLittleSkin?: (username: string, password: string) => Promise<PublicAccount>;
  onStartDeviceFlow: () => Promise<DeviceCodeResponse>;
  onPollDeviceFlow: (deviceCode: string) => Promise<PublicAccount>;
  onOpenUrl?: (url: string) => void;
  loginReason?: string | null;
}) {
  const [mode, setMode] = useState<"view" | "login">(account ? "view" : "login");
  const [authType, setAuthType] = useState<AccountType>("microsoft");

  // Microsoft flow state
  const [deviceData, setDeviceData] = useState<DeviceCodeResponse | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Offline flow state
  const [offlineName, setOfflineName] = useState("");
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);

  // Ely.by flow state
  const [elyUsername, setElyUsername] = useState("");
  const [elyPassword, setElyPassword] = useState("");
  const [elyShowPassword, setElyShowPassword] = useState(false);
  const [elyError, setElyError] = useState<string | null>(null);
  const [elyBusy, setElyBusy] = useState(false);

  // LittleSkin flow state
  const [littleUsername, setLittleUsername] = useState("");
  const [littlePassword, setLittlePassword] = useState("");
  const [littleShowPassword, setLittleShowPassword] = useState(false);
  const [littleError, setLittleError] = useState<string | null>(null);
  const [littleBusy, setLittleBusy] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    isPollingRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, []);

  const handleStartMicrosoftLogin = async () => {
    stopPolling();
    setErrorMsg(null);
    setLoadingCode(true);
    try {
      const data = await onStartDeviceFlow();
      setDeviceData(data);
      setLoadingCode(false);
      setPollingStatus("Waiting for approval in your browser...");

      isPollingRef.current = true;
      const intervalSec = Math.max(data.interval || 5, 3);

      pollTimerRef.current = setInterval(async () => {
        if (!isPollingRef.current) return;
        try {
          await onPollDeviceFlow(data.deviceCode);
          stopPolling();
          setPollingStatus("Successfully authenticated!");
          setTimeout(() => {
            onClose();
          }, 800);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes("authorization_pending")) {
            return;
          }
          stopPolling();
          // Auto-close the code page and return to sign-in view so user doesn't have to close modal
          setDeviceData(null);
          if (errMsg.includes("code_expired")) {
            setErrorMsg("The code has expired. Please try again.");
          } else if (errMsg.includes("authorization_declined")) {
            setErrorMsg("Login was cancelled in the browser.");
          } else {
            setErrorMsg(errMsg);
          }
        }
      }, intervalSec * 1000);
    } catch (err: unknown) {
      setLoadingCode(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  const handleCreateOfflineAccount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = offlineName.trim();
    if (!name) {
      setOfflineError("Please enter a player name.");
      return;
    }
    if (name.length > 16) {
      setOfflineError("Player name must be 16 characters or fewer.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      setOfflineError("Player name can only contain letters, numbers, and underscores.");
      return;
    }

    if (!onAddOfflineAccount) return;

    setOfflineBusy(true);
    setOfflineError(null);
    try {
      await onAddOfflineAccount(name);
      setOfflineBusy(false);
      onClose();
    } catch (err: unknown) {
      setOfflineBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      setOfflineError(msg);
    }
  };

  const handleLoginElyBy = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const user = elyUsername.trim();
    const pass = elyPassword.trim();
    if (!user) {
      setElyError("Please enter your Ely.by username or email.");
      return;
    }
    if (!pass) {
      setElyError("Please enter your Ely.by password.");
      return;
    }

    if (!onLoginElyBy) return;

    setElyBusy(true);
    setElyError(null);
    try {
      await onLoginElyBy(user, pass);
      setElyBusy(false);
      onClose();
    } catch (err: unknown) {
      setElyBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      setElyError(msg);
    }
  };

  const handleLoginLittleSkin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const user = littleUsername.trim();
    const pass = littlePassword.trim();
    if (!user) {
      setLittleError("Please enter your LittleSkin email or player name.");
      return;
    }
    if (!pass) {
      setLittleError("Please enter your LittleSkin password.");
      return;
    }

    if (!onLoginLittleSkin) return;

    setLittleBusy(true);
    setLittleError(null);
    try {
      await onLoginLittleSkin(user, pass);
      setLittleBusy(false);
      onClose();
    } catch (err: unknown) {
      setLittleBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      setLittleError(msg);
    }
  };

  const handleCopy = () => {
    if (!deviceData?.userCode) return;
    navigator.clipboard.writeText(deviceData.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenBrowser = () => {
    if (!deviceData?.verificationUri) return;
    handleCopy();
    if (onOpenUrl) {
      onOpenUrl(deviceData.verificationUri);
    } else {
      window.open(deviceData.verificationUri, "_blank");
    }
  };

  const activeBadge = getBadgeConfig(account?.accountType, theme);

  const modalFooter =
    mode === "login" ? (
      account ? (
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary hover:bg-card text-xs font-semibold cursor-pointer transition-colors"
            onClick={() => {
              stopPolling();
              setMode("view");
            }}
            style={{ color: theme.mutedForeground }}
          >
            Back to Accounts
          </button>
        </div>
      ) : undefined
    ) : (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {account && onRemoveAccount && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border-0 bg-transparent text-xs font-semibold cursor-pointer hover:bg-destructive/12 transition-colors"
              onClick={() => {
                onRemoveAccount(account.id);
              }}
              style={{ color: theme.destructive }}
            >
              <Icon name="logout" size={14} color="currentColor" />
              <span>Log Out</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary hover:bg-card text-xs font-semibold cursor-pointer transition-colors"
            onClick={() => {
              setMode("login");
              setAuthType("microsoft");
            }}
            style={{ color: theme.foreground }}
          >
            <Icon name="plus" size={13} color="currentColor" />
            <span>Add Account</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onClose}
            style={{ background: theme.primary, color: theme.primaryForeground }}
          >
            Done
          </button>
        </div>
      </div>
    );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      theme={theme}
      title={mode === "login" ? "Minecraft account" : "Account Management"}
      maxWidth={460}
      footer={modalFooter}
    >
      {loginReason === "launch_required" && mode === "login" && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
          <Icon name="alertCircle" size={15} color="#f59e0b" />
          <span>Account required to launch and play Minecraft.</span>
        </div>
      )}

      {mode === "login" ? (
        <div className="flex flex-col gap-3 w-full">
          {/* Segmented Auth Type Tabs */}
          <div className="flex bg-foreground/6 p-[3px] rounded-lg gap-1 w-full">
            <button
              type="button"
              className={`account-type-tab ${authType === "microsoft" ? "active" : ""}`}
              onClick={() => {
                setAuthType("microsoft");
              }}
            >
              <Icon name="microsoft" size={13} color="currentColor" />
              <span>Microsoft</span>
            </button>
            <button
              type="button"
              className={`account-type-tab ${authType === "elyby" ? "active" : ""}`}
              onClick={() => {
                stopPolling();
                setAuthType("elyby");
              }}
            >
              <ProviderFavicon url="https://ely.by/favicon.ico" fallbackIcon="globe" size={13} />
              <span>Ely.by</span>
            </button>
            <button
              type="button"
              className={`account-type-tab ${authType === "littleskin" ? "active" : ""}`}
              onClick={() => {
                stopPolling();
                setAuthType("littleskin");
              }}
            >
              <ProviderFavicon
                url="https://littleskin.cn/favicon.png"
                fallbackIcon="palette"
                size={13}
              />
              <span>LittleSkin</span>
            </button>
            <button
              type="button"
              className={`account-type-tab ${authType === "offline" ? "active" : ""}`}
              onClick={() => {
                stopPolling();
                setAuthType("offline");
              }}
            >
              <Icon name="user" size={13} color="currentColor" />
              <span>Offline</span>
            </button>
          </div>

          {authType === "offline" ? (
            <div className="flex flex-col gap-3 w-full">
              <form onSubmit={handleCreateOfflineAccount} className="flex flex-col gap-3 w-full">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: theme.foreground }}>
                    Player Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                    placeholder="e.g. Steve"
                    value={offlineName}
                    onChange={(e) => {
                      setOfflineName(e.target.value);
                      if (offlineError) setOfflineError(null);
                    }}
                    maxLength={16}
                    autoFocus
                    style={{
                      background: theme.sidebarAccent,
                      borderColor: offlineError ? theme.destructive : theme.border,
                      color: theme.foreground,
                    }}
                  />
                  {offlineError && (
                    <span style={{ fontSize: "0.75rem", color: theme.destructive }}>
                      {offlineError}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={offlineBusy || !offlineName.trim()}
                  style={{
                    background: theme.primary,
                    color: theme.primaryForeground,
                    marginTop: "4px",
                  }}
                >
                  {offlineBusy ? "Adding Account..." : "Use Offline Account"}
                </button>
              </form>
            </div>
          ) : authType === "elyby" ? (
            <div className="flex flex-col gap-3 w-full">
              <form onSubmit={handleLoginElyBy} className="flex flex-col gap-3 w-full">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: theme.foreground }}>
                    Username or Email
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                    placeholder="username or email"
                    value={elyUsername}
                    onChange={(e) => {
                      setElyUsername(e.target.value);
                      if (elyError) setElyError(null);
                    }}
                    autoFocus
                    style={{
                      background: theme.sidebarAccent,
                      borderColor: elyError ? theme.destructive : theme.border,
                      color: theme.foreground,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: theme.foreground }}>
                    Password
                  </label>
                  <div className="relative flex items-center w-full">
                    <input
                      type={elyShowPassword ? "text" : "password"}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                      placeholder="password"
                      value={elyPassword}
                      onChange={(e) => {
                        setElyPassword(e.target.value);
                        if (elyError) setElyError(null);
                      }}
                      style={{
                        background: theme.sidebarAccent,
                        borderColor: elyError ? theme.destructive : theme.border,
                        color: theme.foreground,
                        paddingRight: "36px",
                      }}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 bg-transparent border-0 cursor-pointer flex items-center justify-center p-1 rounded hover:text-foreground text-muted-foreground"
                      onClick={() => setElyShowPassword(!elyShowPassword)}
                      tabIndex={-1}
                      style={{ color: theme.mutedForeground }}
                    >
                      <Icon
                        name={elyShowPassword ? "eyeOff" : "eye"}
                        size={15}
                        color="currentColor"
                      />
                    </button>
                  </div>
                  {elyError && (
                    <span style={{ fontSize: "0.75rem", color: theme.destructive }}>
                      {elyError}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={elyBusy || !elyUsername.trim() || !elyPassword.trim()}
                  style={{
                    background: theme.primary,
                    color: theme.primaryForeground,
                    marginTop: "4px",
                  }}
                >
                  {elyBusy ? "Signing in..." : "Sign in with Ely.by"}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[0.75rem] mt-1 text-muted-foreground">
                  <span style={{ color: theme.mutedForeground }}>
                    Don't have an Ely.by account?
                  </span>{" "}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer text-[0.75rem] font-medium underline p-0 hover:text-foreground"
                    onClick={() => {
                      if (onOpenUrl) onOpenUrl("https://ely.by");
                      else window.open("https://ely.by", "_blank");
                    }}
                    style={{ color: theme.primary }}
                  >
                    <span>Register at ely.by</span>
                    <Icon name="externalLink" size={11} color="currentColor" />
                  </button>
                </div>
              </form>
            </div>
          ) : authType === "littleskin" ? (
            <div className="flex flex-col gap-3 w-full">
              <form onSubmit={handleLoginLittleSkin} className="flex flex-col gap-3 w-full">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: theme.foreground }}>
                    Email or Character Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                    placeholder="email or character name"
                    value={littleUsername}
                    onChange={(e) => {
                      setLittleUsername(e.target.value);
                      if (littleError) setLittleError(null);
                    }}
                    autoFocus
                    style={{
                      background: theme.sidebarAccent,
                      borderColor: littleError ? theme.destructive : theme.border,
                      color: theme.foreground,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    textAlign: "left",
                  }}
                >
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: theme.foreground }}>
                    Password
                  </label>
                  <div className="relative flex items-center w-full">
                    <input
                      type={littleShowPassword ? "text" : "password"}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                      placeholder="password"
                      value={littlePassword}
                      onChange={(e) => {
                        setLittlePassword(e.target.value);
                        if (littleError) setLittleError(null);
                      }}
                      style={{
                        background: theme.sidebarAccent,
                        borderColor: littleError ? theme.destructive : theme.border,
                        color: theme.foreground,
                        paddingRight: "36px",
                      }}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 bg-transparent border-0 cursor-pointer flex items-center justify-center p-1 rounded hover:text-foreground text-muted-foreground"
                      onClick={() => setLittleShowPassword(!littleShowPassword)}
                      tabIndex={-1}
                      style={{ color: theme.mutedForeground }}
                    >
                      <Icon
                        name={littleShowPassword ? "eyeOff" : "eye"}
                        size={15}
                        color="currentColor"
                      />
                    </button>
                  </div>
                  {littleError && (
                    <span style={{ fontSize: "0.75rem", color: theme.destructive }}>
                      {littleError}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={littleBusy || !littleUsername.trim() || !littlePassword.trim()}
                  style={{
                    background: theme.primary,
                    color: theme.primaryForeground,
                    marginTop: "4px",
                  }}
                >
                  {littleBusy ? "Signing in..." : "Sign in with LittleSkin"}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[0.75rem] mt-1 text-muted-foreground">
                  <span style={{ color: theme.mutedForeground }}>
                    Don't have a LittleSkin account?
                  </span>{" "}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer text-[0.75rem] font-medium underline p-0 hover:text-foreground"
                    onClick={() => {
                      if (onOpenUrl) onOpenUrl("https://littleskin.cn");
                      else window.open("https://littleskin.cn", "_blank");
                    }}
                    style={{ color: theme.primary }}
                  >
                    <span>Register at littleskin.cn</span>
                    <Icon name="externalLink" size={11} color="currentColor" />
                  </button>
                </div>
              </form>
            </div>
          ) : !deviceData ? (
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                className="inline-flex items-center justify-center h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleStartMicrosoftLogin}
                disabled={loadingCode}
                style={{
                  background: theme.primary,
                  color: theme.primaryForeground,
                  width: "100%",
                }}
              >
                {loadingCode ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ display: "inline-flex" }}
                    >
                      <Icon name="refresh" size={16} color="currentColor" />
                    </motion.div>
                    <span>Connecting to Microsoft...</span>
                  </>
                ) : (
                  <>
                    <Icon name="microsoft" size={16} color="currentColor" />
                    <span>Sign in with Microsoft</span>
                  </>
                )}
              </button>

              {errorMsg && (
                <div className="flex flex-row items-start gap-2.5 p-2.5 rounded-lg border border-destructive/35 bg-destructive/16 text-destructive-foreground text-xs w-full">
                  <Icon name="alertCircle" size={16} color="#ef4444" />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span className="flex-1 min-w-0 text-xs leading-relaxed break-words">
                      {errorMsg}
                    </span>
                    {errorMsg.includes("xbox.com") && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer text-[0.75rem] font-medium underline p-0 hover:text-foreground"
                        onClick={() => {
                          if (onOpenUrl) onOpenUrl("https://www.xbox.com");
                          else window.open("https://www.xbox.com", "_blank");
                        }}
                        style={{
                          color: "#ffffff",
                          fontWeight: 600,
                          alignSelf: "flex-start",
                          marginTop: "2px",
                        }}
                      >
                        <span>Open xbox.com</span>
                        <Icon name="externalLink" size={12} color="currentColor" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[0.75rem] mt-1 text-muted-foreground">
                <span style={{ color: theme.mutedForeground }}>
                  Don't have a Minecraft account?
                </span>{" "}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer text-[0.75rem] font-medium underline p-0 hover:text-foreground"
                  onClick={() => {
                    const buyUrl =
                      "https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc";
                    if (onOpenUrl) onOpenUrl(buyUrl);
                    else window.open(buyUrl, "_blank");
                  }}
                  style={{ color: theme.primary }}
                >
                  <span>Buy Minecraft</span>
                  <Icon name="externalLink" size={11} color="currentColor" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              <p
                className="text-[0.78rem] mb-0.5 opacity-85 text-center"
                style={{ color: theme.mutedForeground }}
              >
                Enter this code in your browser to sign in:
              </p>

              <div
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary"
                style={{ background: theme.secondary, borderColor: theme.border }}
              >
                <span className="font-mono text-[1.15rem] font-bold tracking-[0.08em]">
                  {deviceData.userCode}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border-0 text-xs font-semibold cursor-pointer"
                  onClick={handleCopy}
                  style={{
                    background: copied ? theme.success : theme.primary,
                    color: theme.primaryForeground,
                  }}
                >
                  <Icon name={copied ? "check" : "copy"} size={12} color="currentColor" />
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer hover:brightness-108 transition-all"
                onClick={handleOpenBrowser}
                style={{ background: theme.primary, color: theme.primaryForeground }}
              >
                <Icon name="externalLink" size={14} color="currentColor" />
                <span>Open Microsoft Page</span>
              </button>

              <div
                className="flex items-center justify-center gap-2 text-[0.78rem] py-1.5 text-muted-foreground"
                style={{ color: theme.mutedForeground }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  style={{ display: "inline-flex" }}
                >
                  <Icon name="refresh" size={13} color="currentColor" />
                </motion.div>
                <span>{pollingStatus}</span>
              </div>

              {errorMsg && (
                <div className="flex flex-row items-start gap-2.5 p-2.5 rounded-lg border border-destructive/35 bg-destructive/16 text-destructive-foreground text-xs w-full">
                  <Icon name="alertCircle" size={16} color="#ef4444" />
                  <span className="flex-1 min-w-0 text-xs leading-relaxed break-words">
                    {errorMsg}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          {account ? (
            <div
              className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary"
              style={{ background: theme.secondary, borderColor: theme.border }}
            >
              <MinecraftHead
                username={account.accountType === "offline" ? undefined : account.username}
                skinUrl={account.skinUrl ?? undefined}
                size={44}
              />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1 ml-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{account.username}</span>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none"
                    style={{
                      background: activeBadge.bg,
                      color: activeBadge.color,
                    }}
                  >
                    {activeBadge.label}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500"
                    style={{ background: theme.success, color: "#ffffff" }}
                  >
                    Active
                  </span>
                </div>
                <span
                  className="text-[10px] text-muted-foreground font-mono truncate"
                  style={{ color: theme.mutedForeground }}
                >
                  {account.uuid}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-6 text-center">
              No account currently logged in.
            </div>
          )}

          {/* Multi-account list if more than 1 */}
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-2">
                Other Accounts
              </span>
              {accounts
                .filter((a) => a.id !== account?.id)
                .map((other) => {
                  const badge = getBadgeConfig(other.accountType, theme);
                  return (
                    <div
                      key={other.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                      style={{ background: theme.secondary, borderColor: theme.border }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MinecraftHead
                          username={other.accountType === "offline" ? undefined : other.username}
                          skinUrl={other.skinUrl ?? undefined}
                          size={34}
                        />
                        <div className="flex flex-col min-w-0 flex-1 ml-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium truncate">{other.username}</span>
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none"
                              style={{
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono truncate">
                            {other.uuid}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="px-2.5 py-1 text-[11px] font-medium rounded border border-border bg-card hover:bg-secondary cursor-pointer transition-colors"
                          onClick={() => onSelectAccount?.(other.id)}
                        >
                          Switch
                        </button>
                        <button
                          type="button"
                          className="size-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/15 cursor-pointer transition-colors"
                          onClick={() => onRemoveAccount?.(other.id)}
                          title={`Remove ${other.username}`}
                        >
                          <Icon name="trash" size={14} color={theme.destructive} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function AccountModal({
  isOpen,
  onClose,
  theme,
  account,
  accounts = [],
  onSelectAccount,
  onRemoveAccount,
  onAddOfflineAccount,
  onLoginElyBy,
  onLoginLittleSkin,
  onStartDeviceFlow,
  onPollDeviceFlow,
  onOpenUrl,
  loginReason,
}: {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  account: PublicAccount | null;
  accounts?: PublicAccount[];
  onSelectAccount?: (id: string) => void;
  onRemoveAccount?: (id: string) => void;
  onAddOfflineAccount?: (username: string) => Promise<PublicAccount>;
  onLoginElyBy?: (username: string, password: string) => Promise<PublicAccount>;
  onLoginLittleSkin?: (username: string, password: string) => Promise<PublicAccount>;
  onStartDeviceFlow: () => Promise<DeviceCodeResponse>;
  onPollDeviceFlow: (deviceCode: string) => Promise<PublicAccount>;
  onOpenUrl?: (url: string) => void;
  loginReason?: string | null;
}) {
  if (!isOpen) return null;

  return (
    <AccountModalDialog
      onClose={onClose}
      theme={theme}
      account={account}
      accounts={accounts}
      onSelectAccount={onSelectAccount}
      onRemoveAccount={onRemoveAccount}
      onAddOfflineAccount={onAddOfflineAccount}
      onLoginElyBy={onLoginElyBy}
      onLoginLittleSkin={onLoginLittleSkin}
      onStartDeviceFlow={onStartDeviceFlow}
      onPollDeviceFlow={onPollDeviceFlow}
      onOpenUrl={onOpenUrl}
      loginReason={loginReason}
    />
  );
}
