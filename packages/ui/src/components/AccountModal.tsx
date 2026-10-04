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
        <div className="account-footer-actions">
          <button
            type="button"
            className="account-secondary-btn"
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
      <div className="account-footer-actions">
        <div className="account-footer-left">
          {account && onRemoveAccount && (
            <button
              type="button"
              className="account-logout-btn"
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
        <div className="account-footer-right">
          <button
            type="button"
            className="account-secondary-btn"
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
            className="account-primary-btn"
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
        <div className="account-modal-alert">
          <Icon name="alertCircle" size={15} color="#f59e0b" />
          <span>Account required to launch and play Minecraft.</span>
        </div>
      )}

      {mode === "login" ? (
        <div className="account-login-flow">
          {/* Segmented Auth Type Tabs */}
          <div className="account-type-tabs">
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
            <div className="account-offline-flow">
              <form onSubmit={handleCreateOfflineAccount} className="account-offline-form">
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
                    className="modal-text-input"
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
                  className="account-primary-btn"
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
            <div className="account-offline-flow">
              <form onSubmit={handleLoginElyBy} className="account-offline-form">
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
                    className="modal-text-input"
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
                  <div className="password-input-wrapper">
                    <input
                      type={elyShowPassword ? "text" : "password"}
                      className="modal-text-input"
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
                      className="password-toggle-btn"
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
                  className="account-primary-btn"
                  disabled={elyBusy || !elyUsername.trim() || !elyPassword.trim()}
                  style={{
                    background: theme.primary,
                    color: theme.primaryForeground,
                    marginTop: "4px",
                  }}
                >
                  {elyBusy ? "Signing in..." : "Sign in with Ely.by"}
                </button>

                <div className="account-register-hint">
                  <span style={{ color: theme.mutedForeground }}>
                    Don't have an Ely.by account?
                  </span>{" "}
                  <button
                    type="button"
                    className="account-register-link"
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
            <div className="account-offline-flow">
              <form onSubmit={handleLoginLittleSkin} className="account-offline-form">
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
                    className="modal-text-input"
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
                  <div className="password-input-wrapper">
                    <input
                      type={littleShowPassword ? "text" : "password"}
                      className="modal-text-input"
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
                      className="password-toggle-btn"
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
                  className="account-primary-btn"
                  disabled={littleBusy || !littleUsername.trim() || !littlePassword.trim()}
                  style={{
                    background: theme.primary,
                    color: theme.primaryForeground,
                    marginTop: "4px",
                  }}
                >
                  {littleBusy ? "Signing in..." : "Sign in with LittleSkin"}
                </button>

                <div className="account-register-hint">
                  <span style={{ color: theme.mutedForeground }}>
                    Don't have a LittleSkin account?
                  </span>{" "}
                  <button
                    type="button"
                    className="account-register-link"
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
            <div className="account-ms-start">
              <button
                type="button"
                className="account-primary-btn"
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
                <div className="account-error-box">
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
                    <span className="account-error-message">{errorMsg}</span>
                    {errorMsg.includes("xbox.com") && (
                      <button
                        type="button"
                        className="account-register-link"
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

              <div className="account-register-hint">
                <span style={{ color: theme.mutedForeground }}>
                  Don't have a Minecraft account?
                </span>{" "}
                <button
                  type="button"
                  className="account-register-link"
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
            <div className="account-ms-code-flow">
              <p className="account-desc-text-sm" style={{ color: theme.mutedForeground }}>
                Enter this code in your browser to sign in:
              </p>

              <div
                className="account-code-card"
                style={{ background: theme.secondary, borderColor: theme.border }}
              >
                <span className="account-user-code">{deviceData.userCode}</span>
                <button
                  type="button"
                  className="account-copy-btn"
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
                className="account-primary-btn account-browser-btn"
                onClick={handleOpenBrowser}
                style={{ background: theme.primary, color: theme.primaryForeground }}
              >
                <Icon name="externalLink" size={14} color="currentColor" />
                <span>Open Microsoft Page</span>
              </button>

              <div className="account-poll-status" style={{ color: theme.mutedForeground }}>
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
                <div className="account-error-box">
                  <Icon name="alertCircle" size={16} color="#ef4444" />
                  <span className="account-error-message">{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="account-view-flow">
          {account ? (
            <div
              className="account-active-card"
              style={{ background: theme.secondary, borderColor: theme.border }}
            >
              <MinecraftHead
                username={account.accountType === "offline" ? undefined : account.username}
                skinUrl={account.skinUrl ?? undefined}
                size={44}
              />
              <div className="account-details">
                <div className="account-name-row">
                  <span className="account-player-name">{account.username}</span>
                  <span
                    className="account-type-badge"
                    style={{
                      background: activeBadge.bg,
                      color: activeBadge.color,
                    }}
                  >
                    {activeBadge.label}
                  </span>
                  <span
                    className="account-active-badge"
                    style={{ background: theme.success, color: "#ffffff" }}
                  >
                    Active
                  </span>
                </div>
                <span className="account-uuid" style={{ color: theme.mutedForeground }}>
                  {account.uuid}
                </span>
              </div>
            </div>
          ) : (
            <div className="account-empty-state">No account currently logged in.</div>
          )}

          {/* Multi-account list if more than 1 */}
          {accounts.length > 1 && (
            <div className="account-other-list">
              <span className="account-section-title">Other Accounts</span>
              {accounts
                .filter((a) => a.id !== account?.id)
                .map((other) => {
                  const badge = getBadgeConfig(other.accountType, theme);
                  return (
                    <div
                      key={other.id}
                      className="account-other-item"
                      style={{ background: theme.secondary, borderColor: theme.border }}
                    >
                      <div className="account-other-left">
                        <MinecraftHead
                          username={other.accountType === "offline" ? undefined : other.username}
                          skinUrl={other.skinUrl ?? undefined}
                          size={34}
                        />
                        <div className="account-other-info">
                          <div className="account-other-name-row">
                            <span className="account-other-name">{other.username}</span>
                            <span
                              className="account-type-badge"
                              style={{
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span className="account-other-uuid">{other.uuid}</span>
                        </div>
                      </div>
                      <div className="account-other-actions">
                        <button
                          type="button"
                          className="account-action-sm-btn"
                          onClick={() => onSelectAccount?.(other.id)}
                        >
                          Switch
                        </button>
                        <button
                          type="button"
                          className="account-remove-icon-btn"
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
