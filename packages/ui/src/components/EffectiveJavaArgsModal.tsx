import { useState } from "react";
import { Icon } from "./Icon";
import { Modal } from "./ui/modal";
import type { Theme } from "../theme";
import { resolveEffectiveJavaArgs, type Settings } from "../settings";

export interface EffectiveJavaArgsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  theme: Theme;
}

export function EffectiveJavaArgsModal({
  isOpen,
  onClose,
  settings,
  theme,
}: EffectiveJavaArgsModalProps) {
  const [copied, setCopied] = useState(false);

  const { allArgs } = resolveEffectiveJavaArgs(settings);
  const commandLineText = allArgs.join(" ");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(commandLineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy Java arguments", err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title="Effective Java Arguments"
      maxWidth={560}
      footer={
        <>
          <button
            type="button"
            className="modal-cancel-btn"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="modal-confirm-btn"
            style={{
              background: theme.primary,
              color: theme.primaryForeground,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={handleCopy}
          >
            <Icon name={copied ? "check" : "copy"} size={13} color="currentColor" />
            <span>{copied ? "Copied!" : "Copy to Clipboard"}</span>
          </button>
        </>
      }
    >
      <div className="java-args-command-section">
        <div className="java-args-command-header">
          <span className="section-title" style={{ color: theme.mutedForeground }}>
            Combined Runtime Arguments ({allArgs.length} flags)
          </span>
        </div>
        <div
          className="java-args-command-box"
          style={{
            background: theme.secondary,
            color: theme.foreground,
          }}
        >
          {commandLineText}
        </div>
      </div>
    </Modal>
  );
}
