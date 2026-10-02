import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Icon } from "./Icon";
import { MinecraftHead } from "./AppHeader";
import { Modal } from "./ui/modal";
import type { Theme } from "../theme";
import type { DeviceCodeResponse, PublicAccount } from "../account";

function AccountModalDialog({
  onClose,
  theme,
  account,
  accounts = [],
  onSelectAccount,
  onRemoveAccount,
  onAddOfflineAccount,
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
  onStartDeviceFlow: () => Promise<DeviceCodeResponse>;
  onPollDeviceFlow: (deviceCode: string) => Promise<PublicAccount>;
  onOpenUrl?: (url: string) => void;
  loginReason?: string | null;
}) {
  const [mode, setMode] = useState<"view" | "login">(account ? "view" : "login");
  const [authType, setAuthType] = useState<"microsoft" | "offline">("microsoft");

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

  const handleCopy = () => {
    if (!deviceData?.userCode) return;
    navigator.clipboard.writeText(deviceData.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenBrowser = () => {
    if (!deviceData?.verificationUri) return;
    if (onOpenUrl) {
      onOpenUrl(deviceData.verificationUri);
    } else {
      window.open(deviceData.verificationUri, "_blank");
    }
  };

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
      maxWidth={440}
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
              <Icon name="brandWindows" size={14} color="currentColor" />
              <span>Microsoft Account</span>
            </button>
            <button
              type="button"
              className={`account-type-tab ${authType === "offline" ? "active" : ""}`}
              onClick={() => {
                stopPolling();
                setAuthType("offline");
              }}
            >
              <Icon name="user" size={14} color="currentColor" />
              <span>Offline Account</span>
            </button>
          </div>

          {authType === "offline" ? (
            <div className="account-offline-flow">
              <div
                className="account-offline-preview"
                style={{ background: theme.secondary, borderColor: theme.border }}
              >
                <MinecraftHead username={offlineName.trim() || "Steve"} size={44} />
                <div className="account-offline-info">
                  <span className="account-offline-name">{offlineName.trim() || "Player"}</span>
                  <span className="account-offline-sub" style={{ color: theme.mutedForeground }}>
                    Offline Mode • No Microsoft login required
                  </span>
                </div>
              </div>

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
                    width: "100%",
                    marginTop: "4px",
                  }}
                >
                  <Icon name="user" size={14} color="currentColor" />
                  <span>{offlineBusy ? "Adding..." : "Use Offline Account"}</span>
                </button>
              </form>
            </div>
          ) : (
            <>
              {loadingCode ? (
                <div className="account-loading-box">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Icon name="loader" size={22} color={theme.foreground} />
                  </motion.div>
                  <span className="account-loading-text">Connecting to Microsoft...</span>
                </div>
              ) : errorMsg ? (
                <div className="account-error-box">
                  <span className="account-error-text">{errorMsg}</span>
                  <button
                    type="button"
                    className="account-primary-btn"
                    onClick={handleStartMicrosoftLogin}
                    style={{ background: theme.primary, color: theme.primaryForeground }}
                  >
                    <Icon name="refresh" size={14} color="currentColor" />
                    Try Again
                  </button>
                </div>
              ) : deviceData ? (
                <div className="account-code-flow">
                  <p className="account-instructions">
                    To sign in, visit the Microsoft link and enter the code below:
                  </p>

                  <div
                    className="account-code-card"
                    style={{ background: theme.secondary, borderColor: theme.border }}
                  >
                    <span className="account-code-value">{deviceData.userCode}</span>
                    <button
                      type="button"
                      className="account-copy-btn"
                      onClick={handleCopy}
                      title="Copy code to clipboard"
                    >
                      <Icon name={copied ? "check" : "copy"} size={14} color="currentColor" />
                      <span>{copied ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>

                  <div className="account-flow-actions">
                    <button
                      type="button"
                      className="account-primary-btn"
                      onClick={handleOpenBrowser}
                      style={{ background: theme.primary, color: theme.primaryForeground }}
                    >
                      <Icon name="externalLink" size={15} color="currentColor" />
                      <span>Open Microsoft Page</span>
                    </button>
                  </div>

                  <div className="account-polling-indicator">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    >
                      <Icon name="loader" size={13} color={theme.mutedForeground} />
                    </motion.div>
                    <span style={{ color: theme.mutedForeground }}>
                      {pollingStatus ?? "Waiting for confirmation in your browser..."}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="account-start-box">
                  <p className="account-instructions">
                    Sign in with your Microsoft account to play Minecraft Java Edition.
                  </p>
                  <button
                    type="button"
                    className="account-primary-btn"
                    onClick={handleStartMicrosoftLogin}
                    style={{ background: theme.primary, color: theme.primaryForeground }}
                  >
                    <Icon name="brandWindows" size={15} color="currentColor" />
                    <span>Sign in with Microsoft</span>
                  </button>
                </div>
              )}
            </>
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
                username={account.username}
                skinUrl={account.skinUrl ?? undefined}
                size={44}
              />
              <div className="account-details">
                <div className="account-name-row">
                  <span className="account-player-name">{account.username}</span>
                  <span
                    className="account-type-badge"
                    style={{
                      background:
                        account.accountType === "offline"
                          ? "rgba(120, 120, 120, 0.18)"
                          : "rgba(16, 185, 129, 0.15)",
                      color:
                        account.accountType === "offline" ? theme.mutedForeground : theme.success,
                    }}
                  >
                    {account.accountType === "offline" ? "Offline" : "Microsoft"}
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
                .map((other) => (
                  <div
                    key={other.id}
                    className="account-other-item"
                    style={{ background: theme.secondary, borderColor: theme.border }}
                  >
                    <div className="account-other-left">
                      <MinecraftHead
                        username={other.username}
                        skinUrl={other.skinUrl ?? undefined}
                        size={34}
                      />
                      <div className="account-other-info">
                        <div className="account-other-name-row">
                          <span className="account-other-name">{other.username}</span>
                          <span
                            className="account-type-badge"
                            style={{
                              background:
                                other.accountType === "offline"
                                  ? "rgba(120, 120, 120, 0.18)"
                                  : "rgba(16, 185, 129, 0.15)",
                              color:
                                other.accountType === "offline"
                                  ? theme.mutedForeground
                                  : theme.success,
                            }}
                          >
                            {other.accountType === "offline" ? "Offline" : "Microsoft"}
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
                        className="account-delete-sm-btn"
                        onClick={() => onRemoveAccount?.(other.id)}
                        aria-label={`Remove ${other.username}`}
                        title={`Remove ${other.username}`}
                      >
                        <Icon name="trash" size={14} color={theme.destructive} />
                      </button>
                    </div>
                  </div>
                ))}
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
      onStartDeviceFlow={onStartDeviceFlow}
      onPollDeviceFlow={onPollDeviceFlow}
      onOpenUrl={onOpenUrl}
      loginReason={loginReason}
    />
  );
}
