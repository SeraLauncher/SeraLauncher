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

  if (!isOpen) return null;

  const { memoryArgs, gcArgs, optimizeArgs, customArgs, allArgs } =
    resolveEffectiveJavaArgs(settings);

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
      <div className="java-args-modal-backdrop" onClick={onClose}>
        <motion.div
          className="java-args-modal"
          style={{
            background: theme.card,
            color: theme.text,
          }}
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="java-args-modal-title"
        >
          {/* Header */}
          <div className="java-args-modal-header">
            <div className="java-args-modal-title-group">
              <div
                className="java-args-modal-icon-badge"
                style={{
                  background: theme.raised,
                  color: theme.accent,
                }}
              >
                <Icon name="coffee" size={18} color={theme.accent} />
              </div>
              <div>
                <h3
                  id="java-args-modal-title"
                  className="java-args-modal-title"
                  style={{ color: theme.text }}
                >
                  Effective Java Arguments
                </h3>
                <p className="java-args-modal-subtitle" style={{ color: theme.muted }}>
                  Runtime flags that will be passed when launching Minecraft ({allArgs.length} total)
                </p>
              </div>
            </div>
            <button
              type="button"
              className="java-args-modal-close"
              onClick={onClose}
              title="Close modal"
              aria-label="Close modal"
              style={{ color: theme.muted }}
            >
              <Icon name="x" size={18} color={theme.muted} />
            </button>
          </div>

          {/* Body */}
          <div className="java-args-modal-body">
            {/* Quick Status Cards */}
            <div className="java-args-summary-grid">
              <div
                className="java-args-summary-item"
                style={{ background: theme.raised }}
              >
                <span className="summary-label" style={{ color: theme.muted }}>
                  Allocated RAM
                </span>
                <span className="summary-value" style={{ color: theme.text }}>
                  {settings.minMemory}M – {settings.maxMemory}M
                </span>
              </div>
              <div
                className="java-args-summary-item"
                style={{ background: theme.raised }}
              >
                <span className="summary-label" style={{ color: theme.muted }}>
                  Garbage Collector
                </span>
                <span className="summary-value" style={{ color: theme.text }}>
                  {settings.gcPreset.toUpperCase()}
                </span>
              </div>
              <div
                className="java-args-summary-item"
                style={{ background: theme.raised }}
              >
                <span className="summary-label" style={{ color: theme.muted }}>
                  Optimization
                </span>
                <span
                  className="summary-value"
                  style={{ color: settings.javaOptimize ? theme.accent : theme.muted }}
                >
                  {settings.javaOptimize ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div
                className="java-args-summary-item"
                style={{ background: theme.raised }}
              >
                <span className="summary-label" style={{ color: theme.muted }}>
                  Custom Flags
                </span>
                <span className="summary-value" style={{ color: theme.text }}>
                  {customArgs.length > 0 ? `${customArgs.length} defined` : "None"}
                </span>
              </div>
            </div>

            {/* Complete Command Line String */}
            <div className="java-args-command-section">
              <div className="java-args-command-header">
                <span className="section-title" style={{ color: theme.text }}>
                  Combined Argument String
                </span>
                <button
                  type="button"
                  className="java-args-copy-button"
                  onClick={handleCopy}
                  style={{
                    background: theme.raised,
                    color: copied ? theme.success : theme.text,
                  }}
                >
                  <Icon
                    name={copied ? "check" : "copy"}
                    size={14}
                    color={copied ? theme.success : theme.muted}
                  />
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <div
                className="java-args-command-box"
                style={{
                  background: theme.raised,
                  color: theme.text,
                }}
              >
                {commandLineText}
              </div>
            </div>

            {/* Categorized Breakdown */}
            <div className="java-args-breakdown-section">
              <span className="section-title" style={{ color: theme.text }}>
                Flag Breakdown
              </span>

              {/* Memory */}
              <div className="java-args-group">
                <div className="group-label" style={{ color: theme.muted }}>
                  Memory Limits
                </div>
                <div className="group-tags">
                  {memoryArgs.map((arg) => (
                    <span
                      key={arg}
                      className="arg-tag"
                      style={{
                        background: theme.raised,
                        color: theme.text,
                      }}
                    >
                      {arg}
                    </span>
                  ))}
                </div>
              </div>

              {/* Garbage Collector */}
              {gcArgs.length > 0 && (
                <div className="java-args-group">
                  <div className="group-label" style={{ color: theme.muted }}>
                    Garbage Collector ({settings.gcPreset.toUpperCase()})
                  </div>
                  <div className="group-tags">
                    {gcArgs.map((arg) => (
                      <span
                        key={arg}
                        className="arg-tag"
                        style={{
                          background: theme.raised,
                          color: theme.text,
                        }}
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimizations */}
              {optimizeArgs.length > 0 && (
                <div className="java-args-group">
                  <div className="group-label" style={{ color: theme.muted }}>
                    Optimization Defaults ({optimizeArgs.length} flags)
                  </div>
                  <div className="group-tags">
                    {optimizeArgs.map((arg) => (
                      <span
                        key={arg}
                        className="arg-tag"
                        style={{
                          background: theme.raised,
                          color: theme.muted,
                        }}
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Arguments */}
              {customArgs.length > 0 && (
                <div className="java-args-group">
                  <div className="group-label" style={{ color: theme.accent }}>
                    Custom Arguments ({customArgs.length} flags)
                  </div>
                  <div className="group-tags">
                    {customArgs.map((arg) => (
                      <span
                        key={arg}
                        className="arg-tag custom-arg"
                        style={{
                          background: theme.raised,
                          color: theme.accent,
                        }}
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="java-args-modal-footer">
            <button
              type="button"
              className="java-args-modal-done"
              onClick={onClose}
              style={{
                background: theme.accent,
                color: theme.shell,
              }}
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
