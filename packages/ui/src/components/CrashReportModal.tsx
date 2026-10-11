import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "./Icon";
import { Modal } from "./ui/modal";
import { Badge } from "./ui/badge";
import type { Theme } from "../theme";
import type { CrashAnalysis, InstanceManagementTab } from "../instance";

interface CrashReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  analysis: CrashAnalysis | null;
  loading?: boolean;
  onSelectTab?: (tab: InstanceManagementTab) => void;
  onOpenFolder?: (subfolder?: string) => void;
}

function getCategoryBadge(cat?: string) {
  switch (cat) {
    case "out_of_memory":
      return (
        <Badge variant="environment" className="bg-amber-500/15 text-amber-500 border-amber-500/30">
          Memory Limit
        </Badge>
      );
    case "missing_dependency":
      return (
        <Badge variant="environment" className="bg-rose-500/15 text-rose-500 border-rose-500/30">
          Missing Dependency
        </Badge>
      );
    case "incompatible_java":
      return (
        <Badge
          variant="environment"
          className="bg-indigo-500/15 text-indigo-500 border-indigo-500/30"
        >
          Java Incompatible
        </Badge>
      );
    case "corrupt_jar":
      return (
        <Badge variant="environment" className="bg-rose-500/15 text-rose-500 border-rose-500/30">
          Corrupted File
        </Badge>
      );
    case "native_library":
      return (
        <Badge
          variant="environment"
          className="bg-purple-500/15 text-purple-500 border-purple-500/30"
        >
          Graphics / System
        </Badge>
      );
    case "mod_conflict":
      return (
        <Badge
          variant="environment"
          className="bg-orange-500/15 text-orange-500 border-orange-500/30"
        >
          Mod Conflict
        </Badge>
      );
    default:
      return <Badge variant="environment">Game Crash</Badge>;
  }
}

export function CrashReportModal({
  isOpen,
  onClose,
  theme,
  analysis,
  loading = false,
  onSelectTab,
  onOpenFolder,
}: CrashReportModalProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!isOpen) return null;

  const handleCopyReport = () => {
    if (!analysis) return;
    const reportText = `[SeraLauncher Crash Diagnosis]
Cause: ${analysis.title} (${analysis.causeCategory})
Summary: ${analysis.summary}
Suggested Fix: ${analysis.suggestedFix}
Suspected Mods: ${analysis.suspectedMods.join(", ") || "None"}

Technical Details:
${analysis.technicalDetails || "No additional trace available."}
`;
    navigator.clipboard.writeText(reportText);
    toast.success("Crash analysis copied to clipboard");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title={
        <div className="flex items-center gap-2">
          <Icon name="bug" size={16} color={theme.destructive} />
          <span className="font-bold text-sm">Crash Log Analyzer</span>
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
          >
            Close
          </button>
          {analysis?.hasCrashed && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-7.5 px-3 rounded-md border border-border bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none"
              style={{ color: theme.foreground }}
              onClick={handleCopyReport}
            >
              <Icon name="copy" size={13} color="currentColor" />
              <span>Copy Report</span>
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3.5 py-1">
        {loading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-2.5 text-xs text-muted-foreground">
            <Icon name="refresh" size={20} color={theme.primary} className="animate-spin" />
            <span>Analyzing session logs and crash reports...</span>
          </div>
        ) : !analysis || !analysis.hasCrashed ? (
          <div className="p-6 flex flex-col items-center justify-center text-center gap-2 rounded-xl border border-border bg-secondary/50">
            <Icon name="check" size={24} color={theme.success} />
            <span className="text-xs font-semibold" style={{ color: theme.foreground }}>
              No crash found
            </span>
            <span className="text-xs text-muted-foreground">
              The latest session closed normally or no errors were recorded.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Crash Header Callout */}
            <div
              className="p-3.5 rounded-xl border border-destructive/30 flex flex-col gap-2"
              style={{ background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm leading-tight text-foreground">
                  {analysis.title}
                </span>
                {getCategoryBadge(analysis.causeCategory)}
              </div>

              <p className="text-xs leading-relaxed m-0 text-muted-foreground">
                {analysis.summary}
              </p>
            </div>

            {/* Suspected Mods / Culprits */}
            {analysis.suspectedMods.length > 0 && (
              <div
                className="p-3 rounded-xl border border-border flex flex-col gap-1.5"
                style={{ background: theme.card }}
              >
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Suspected Culprit / Requirement
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {analysis.suspectedMods.map((mod) => (
                    <Badge
                      key={mod}
                      variant="environment"
                      className="font-semibold text-foreground"
                    >
                      {mod}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Action Box */}
            <div
              className="p-3 rounded-xl border border-primary/30 flex flex-col gap-2"
              style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
            >
              <div
                className="flex items-center gap-1.5 text-xs font-bold"
                style={{ color: theme.primary }}
              >
                <Icon name="wand" size={13} color="currentColor" />
                <span>Recommended Solution</span>
              </div>
              <p className="text-xs leading-relaxed m-0 text-foreground/90">
                {analysis.suggestedFix}
              </p>

              {/* Action shortcuts */}
              <div className="flex items-center gap-2 pt-1">
                {analysis.causeCategory === "out_of_memory" ||
                analysis.causeCategory === "incompatible_java" ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectTab?.("settings");
                    }}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold cursor-pointer select-none transition-all hover:brightness-110"
                    style={{ background: theme.primary, color: theme.primaryForeground }}
                  >
                    <Icon name="settings" size={12} color="currentColor" />
                    <span>Open Instance Settings</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectTab?.("mods");
                    }}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-semibold cursor-pointer select-none transition-all hover:brightness-110"
                    style={{ background: theme.primary, color: theme.primaryForeground }}
                  >
                    <Icon name="puzzle" size={12} color="currentColor" />
                    <span>Open Mods Tab</span>
                  </button>
                )}

                {analysis.crashReportFile && (
                  <button
                    type="button"
                    onClick={() => onOpenFolder?.("crash-reports")}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary text-xs font-medium text-foreground cursor-pointer hover:bg-card transition-colors select-none"
                  >
                    <Icon name="folder" size={12} color="currentColor" />
                    <span>View File</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expandable Technical Trace */}
            {analysis.technicalDetails && (
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTechnical(!showTechnical)}
                  className="flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0 p-0 text-left select-none"
                >
                  <span>Technical Trace Snippet</span>
                  <Icon
                    name="chevronDown"
                    className={`transition-transform duration-150 ${showTechnical ? "rotate-180" : ""}`}
                    size={13}
                    color="currentColor"
                  />
                </button>

                {showTechnical && (
                  <pre className="p-2.5 rounded-lg border border-border bg-[#18181b] font-mono text-[11px] leading-relaxed overflow-x-auto text-rose-300/90 max-h-[160px] select-text">
                    {analysis.technicalDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
