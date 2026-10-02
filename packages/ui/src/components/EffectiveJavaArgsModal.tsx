import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "./Icon";
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

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="java-args-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={onClose}
        >
          <motion.div
            className="java-args-modal"
            style={{
              background: theme.card,
              color: theme.foreground,
            }}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="java-args-modal-title"
          >
            {/* Header: Clean, no icon badge, no separator */}
            <div className="java-args-modal-header">
              <div>
                <h3
                  id="java-args-modal-title"
                  className="java-args-modal-title"
                  style={{ color: theme.foreground }}
                >
                  Effective Java Arguments
                </h3>
                <p className="java-args-modal-subtitle" style={{ color: theme.mutedForeground }}>
                  Combined runtime arguments for Minecraft ({allArgs.length} flags)
                </p>
              </div>

              {/* Full-radius circular X button using the same raised color as the text box */}
              <button
                type="button"
                className="java-args-modal-close"
                onClick={onClose}
                title="Close modal"
                aria-label="Close modal"
                style={{
                  background: theme.secondary,
                  color: theme.foreground,
                }}
              >
                <Icon name="x" size={14} color={theme.foreground} />
              </button>
            </div>

            {/* Body: Arguments string only */}
            <div className="java-args-modal-body">
              <div className="java-args-command-section">
                <div className="java-args-command-header">
                  <span className="section-title" style={{ color: theme.mutedForeground }}>
                    Arguments String
                  </span>
                  {/* Copy button using the same raised color as the text box */}
                  <button
                    type="button"
                    className="java-args-copy-button"
                    onClick={handleCopy}
                    style={{
                      background: theme.secondary,
                      color: copied ? theme.success : theme.foreground,
                    }}
                  >
                    <Icon
                      name={copied ? "check" : "copy"}
                      size={14}
                      color={copied ? theme.success : theme.mutedForeground}
                    />
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                {/* Arguments box using the same raised color as the text box */}
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
