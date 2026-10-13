import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/modal";
import { Badge } from "./ui/badge";
import { Icon } from "./Icon";
import type { Theme } from "../theme";
import type { SafetyReport } from "../instance";

interface CompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SafetyReport | null;
  instanceName: string;
  theme: Theme;
  onResolveAndLaunch?: () => Promise<void>;
  onLaunchAnyway?: () => void;
}

export function CompatibilityModal({
  isOpen,
  onClose,
  report,
  instanceName,
  theme,
  onResolveAndLaunch,
  onLaunchAnyway,
}: CompatibilityModalProps) {
  const [resolving, setResolving] = useState(false);

  if (!isOpen || !report) return null;

  const blockingIssues = report.issues.filter((i) => i.severity === "blocking");
  const warnings = report.issues.filter((i) => i.severity !== "blocking");
  const hasAutoResolvable = report.issues.some((i) => i.autoResolvable);

  const handleFix = async () => {
    if (!onResolveAndLaunch) return;
    setResolving(true);
    try {
      await onResolveAndLaunch();
      onClose();
    } catch (err) {
      toast.error(`Failed to resolve dependencies: ${err}`);
    } finally {
      setResolving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title={
        <div className="flex items-center gap-2 text-rose-500 font-bold">
          <Icon name="alertCircle" size={18} color="currentColor" />
          <span>Pre-Launch Compatibility Warning</span>
        </div>
      }
      maxWidth={520}
      footer={
        <>
          <button
            type="button"
            className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={resolving}
          >
            Cancel
          </button>

          {onLaunchAnyway && (
            <button
              type="button"
              className="h-7.5 px-3 rounded-md border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none text-muted-foreground hover:text-foreground"
              onClick={() => {
                onClose();
                onLaunchAnyway();
              }}
              disabled={resolving}
              title="Ignore warnings and launch game process anyway"
            >
              Launch Anyway
            </button>
          )}

          {hasAutoResolvable && onResolveAndLaunch && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer transition-[opacity,filter] hover:brightness-108 disabled:opacity-50 select-none"
              style={{ background: theme.primary, color: theme.primaryForeground }}
              onClick={handleFix}
              disabled={resolving}
            >
              <Icon name="download" size={13} color="currentColor" />
              <span>{resolving ? "Resolving..." : "Fix & Install Dependencies"}</span>
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1 text-xs">
        <p className="text-foreground m-0 leading-relaxed">
          The launcher scanned your installed mods for <strong>{instanceName}</strong> and found{" "}
          <strong className="text-rose-500">
            {report.issues.length} compatibility {report.issues.length === 1 ? "issue" : "issues"}
          </strong>{" "}
          that may crash Minecraft on startup:
        </p>

        {/* Issues List */}
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          {blockingIssues.map((issue, idx) => (
            <div
              key={`block-${idx}`}
              className="p-3 rounded-xl border border-rose-500/25 bg-rose-500/10 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-rose-400 text-xs">{issue.sourceMod}</span>
                <Badge
                  variant="environment"
                  className="bg-rose-500/20 text-rose-300 border-rose-500/40"
                >
                  {issue.issueType === "missing_dependency"
                    ? "Missing Dependency"
                    : issue.issueType === "incompatible_java"
                      ? "Java Incompatible"
                      : "Conflict"}
                </Badge>
              </div>
              <p className="text-muted-foreground m-0 leading-relaxed text-[11px]">
                {issue.description}
              </p>
            </div>
          ))}

          {warnings.map((issue, idx) => (
            <div
              key={`warn-${idx}`}
              className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/10 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-400 text-xs">{issue.sourceMod}</span>
                <Badge
                  variant="environment"
                  className="bg-amber-500/20 text-amber-300 border-amber-500/40"
                >
                  Warning
                </Badge>
              </div>
              <p className="text-muted-foreground m-0 leading-relaxed text-[11px]">
                {issue.description}
              </p>
            </div>
          ))}
        </div>

        {hasAutoResolvable && (
          <div
            className="p-2.5 rounded-lg border border-border bg-card/60 flex items-center gap-2 text-muted-foreground text-[11px]"
            style={{ background: theme.sidebarAccent }}
          >
            <Icon name="check" size={14} color={theme.primary} />
            <span>
              Click <strong>Fix &amp; Install Dependencies</strong> to automatically download and
              install all required libraries before booting.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
