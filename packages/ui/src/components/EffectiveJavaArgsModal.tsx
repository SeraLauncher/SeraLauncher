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
            className="h-8 px-3.5 rounded-md border-0 bg-transparent text-[0.82rem] font-medium cursor-pointer transition-colors duration-120 hover:bg-foreground/5"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md border-0 text-[0.82rem] font-semibold cursor-pointer transition-[opacity,filter] duration-120 hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-semibold text-muted-foreground"
            style={{ color: theme.mutedForeground }}
          >
            Combined Runtime Arguments ({allArgs.length} flags)
          </span>
        </div>
        <div
          className="p-3.5 rounded-[10px] font-mono text-[0.8rem] leading-relaxed max-h-[300px] overflow-y-auto break-all bg-secondary text-foreground"
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
