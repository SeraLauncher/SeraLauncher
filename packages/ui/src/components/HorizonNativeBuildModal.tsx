import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./ui/modal";
import { Icon } from "./Icon";
import type { Theme } from "../theme";
import type { Instance } from "../instance";

export interface HorizonNativeBuildModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
  theme: Theme;
  isBuilding: boolean;
  onRebuild: () => Promise<void>;
}

export function HorizonNativeBuildModal({
  isOpen,
  onClose,
  instance,
  theme,
  isBuilding,
  onRebuild,
}: HorizonNativeBuildModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [buildStatus, setBuildStatus] = useState<"idle" | "building" | "success" | "error">(
    isBuilding ? "building" : "idle",
  );
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>("Ready to build");
  const terminalRef = useRef<HTMLDivElement>(null);

  // Sync isBuilding prop to status and reset log states
  useEffect(() => {
    if (isBuilding) {
      setLogs([]);
      setProgressPercent(0);
      setBuildStatus("building");
      setCurrentStep("Starting native compilation...");
    }
  }, [isBuilding]);

  // Initial logs fetch when modal opens (only if not currently building from scratch)
  useEffect(() => {
    if (!isOpen || isBuilding) return;
    invoke<string>("get_instance_logs", { id: instance.id })
      .then((existing) => {
        if (existing && existing.trim()) {
          const lines = existing.trim().split("\n");
          setLogs(lines.slice(-300));
        }
      })
      .catch(() => {});
  }, [isOpen, isBuilding, instance.id]);

  // Real-time event listener for live streaming lines
  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    interface LogPayload {
      id: string;
      line: string;
    }

    listen<LogPayload>("instance_log_line", (event) => {
      if (event.payload.id === instance.id) {
        const line = event.payload.line.trim();
        if (!line) return;

        setLogs((prev) => {
          // If previous line was a percentage progress line and current line is also progress, replace it in place
          if (
            prev.length > 0 &&
            line.includes("%") &&
            prev[prev.length - 1].includes("%") &&
            line.slice(0, 15) === prev[prev.length - 1].slice(0, 15)
          ) {
            return [...prev.slice(0, -1), line];
          }
          return [...prev.slice(-400), line];
        });

        // Parse build progress & phase from compiler output
        if (line.includes("Compiling") && line.includes("crates")) {
          setCurrentStep(line);
          const match = line.match(/(\d+)\s+of\s+(\d+)/);
          if (match) {
            const current = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            if (total > 0) {
              const pct = 30 + Math.round((current / total) * 65);
              setProgressPercent(Math.min(98, pct));
            }
          }
        } else if (line.includes("Downloading Rust")) {
          setCurrentStep(line);
          const match = line.match(/(\d+)%/);
          if (match) {
            setProgressPercent(Math.round(parseInt(match[1], 10) * 0.25));
          }
        } else if (line.includes("Unpacking native mod mixin bundles")) {
          setCurrentStep("Staging native mixin bundles...");
          setProgressPercent(5);
        } else if (
          line.includes("Downloading Horizon's source") ||
          line.includes("Building horizon-mixins")
        ) {
          setCurrentStep(line);
          setProgressPercent(28);
        } else if (line.includes("Applying the mixins")) {
          setCurrentStep("Applying native source mixins...");
          setProgressPercent(32);
        } else if (
          line.includes("native-build completed successfully") ||
          line.includes("Installed custom native binary")
        ) {
          setBuildStatus("success");
          setCurrentStep("Build completed successfully!");
          setProgressPercent(100);
        } else if (line.includes("[ERROR]") || line.includes("native-build failed")) {
          setBuildStatus("error");
          setCurrentStep("Compilation failed. See error log below.");
        }
      }
    }).then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        unlisten = unsub;
      }
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [isOpen, instance.id]);

  // Auto-scroll terminal on new log lines
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyLogs = () => {
    if (logs.length > 0) {
      navigator.clipboard.writeText(logs.join("\n"));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title={
        <div className="flex items-center gap-2.5">
          <Icon name="wand" size={16} color={theme.primary} />
          <span className="font-semibold text-sm">Compiling Native Mods · {instance.name}</span>
        </div>
      }
      maxWidth={680}
      contentClassName="p-4 flex flex-col gap-3.5"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLogs}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none"
              style={{ color: theme.foreground }}
              title="Copy terminal logs to clipboard"
            >
              <Icon name="copy" size={13} color="currentColor" />
              <span>Copy Log</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {buildStatus !== "building" && (
              <button
                type="button"
                onClick={async () => {
                  setLogs([]);
                  setProgressPercent(0);
                  setBuildStatus("building");
                  setCurrentStep("Starting rebuild...");
                  await onRebuild();
                }}
                disabled={isBuilding}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-secondary text-xs font-medium cursor-pointer hover:bg-card transition-colors select-none"
                style={{ color: theme.foreground }}
              >
                <Icon name="refresh" size={13} color="currentColor" />
                <span>Rebuild</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-8 px-4 rounded-lg text-xs font-semibold cursor-pointer select-none transition-all shadow-xs"
              style={{
                background: buildStatus === "success" ? theme.primary : theme.secondary,
                color: buildStatus === "success" ? theme.primaryForeground : theme.foreground,
              }}
            >
              {isBuilding ? "Run in Background" : "Close"}
            </button>
          </div>
        </div>
      }
    >
      {/* Top Status & Progress Bar */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-secondary/60">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {buildStatus === "building" ? (
              <div className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
            ) : buildStatus === "success" ? (
              <Icon name="check" size={15} color="#10b981" />
            ) : buildStatus === "error" ? (
              <Icon name="alertCircle" size={15} color="#ef4444" />
            ) : (
              <Icon name="wand" size={15} color={theme.mutedForeground} />
            )}
            <span className="font-semibold truncate text-foreground">{currentStep}</span>
          </div>

          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
            {progressPercent > 0 ? `${progressPercent}%` : "Native Build"}
          </span>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-1.5 rounded-full bg-card overflow-hidden ">
          <div
            className="h-full transition-all duration-200"
            style={{
              width: `${Math.max(buildStatus === "building" ? 12 : 0, progressPercent)}%`,
              background:
                buildStatus === "error"
                  ? "#ef4444"
                  : buildStatus === "success"
                    ? "#10b981"
                    : theme.primary,
            }}
          />
        </div>
      </div>

      {/* Real-time Compiler Console Log */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span className="font-semibold text-[11px] uppercase tracking-wider">
            Compilation Output
          </span>
          <span className="font-mono text-[10px]">{logs.length} lines</span>
        </div>

        <div
          ref={terminalRef}
          className="w-full h-64 p-3 rounded-xl font-mono text-[11px] leading-relaxed overflow-y-auto select-text select-auto"
          style={{
            background: "#0d0e12",
            color: "#e2e8f0",
          }}
        >
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 italic text-xs">
              Waiting for compiler output...
            </div>
          ) : (
            logs.map((line, idx) => {
              const isError = line.includes("[ERROR]") || line.includes("error:");
              const isWarn = line.includes("[WARN]") || line.includes("warning:");
              const isInfo = line.includes("[INFO]");
              const isSuccess =
                line.includes("completed successfully") || line.includes("Installed custom");

              return (
                <div
                  key={idx}
                  className={`whitespace-pre-wrap break-all ${
                    isError
                      ? "text-rose-400 font-semibold"
                      : isWarn
                        ? "text-amber-300"
                        : isSuccess
                          ? "text-emerald-400 font-semibold"
                          : line.includes("[DIAGNOSIS]")
                            ? "text-rose-300 bg-rose-950/40 p-1 rounded font-semibold"
                            : line.includes("[TIP]")
                              ? "text-amber-200 bg-amber-950/40 p-1 rounded font-semibold"
                              : isInfo
                                ? "text-sky-300"
                                : "text-zinc-300"
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
