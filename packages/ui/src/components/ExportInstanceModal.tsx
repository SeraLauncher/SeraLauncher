import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Modal } from "./ui/modal";
import { Icon } from "./Icon";
import type { Theme } from "../theme";
import type { Instance, ExportOptions, ExportResult } from "../instance";

interface ExportInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: Instance;
  theme: Theme;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function ExportInstanceModal({
  isOpen,
  onClose,
  instance,
  theme,
}: ExportInstanceModalProps) {
  const [name, setName] = useState(instance.name);
  const [format, setFormat] = useState<"sera_zip" | "mrpack">("sera_zip");
  const [includeMods, setIncludeMods] = useState(true);
  const [includeConfigs, setIncludeConfigs] = useState(true);
  const [includeResourcepacks, setIncludeResourcepacks] = useState(true);
  const [includeShaderpacks, setIncludeShaderpacks] = useState(true);
  const [includeSaves, setIncludeSaves] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!name.trim()) return;
    setIsExporting(true);
    setExportResult(null);

    const options: ExportOptions = {
      instanceId: instance.id,
      name: name.trim(),
      format,
      includeMods,
      includeConfigs,
      includeResourcepacks,
      includeShaderpacks,
      includeSaves,
    };

    try {
      const res = await invoke<ExportResult>("export_instance", { options });
      setExportResult(res);
      toast.success(`Exported ${res.fileName}!`, {
        description: `Saved to ${res.outputPath} (${formatBytes(res.sizeBytes)})`,
      });
    } catch (err) {
      toast.error(`Failed to export instance: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const ext = format === "mrpack" ? ".mrpack" : ".zip";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title="Export Instance"
      maxWidth={480}
      footer={
        <>
          <button
            type="button"
            className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={isExporting}
          >
            {exportResult ? "Close" : "Cancel"}
          </button>
          {!exportResult && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 h-7.5 px-4 rounded-md border-0 text-xs font-semibold cursor-pointer transition-[opacity,filter] hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed select-none"
              style={{ background: theme.primary, color: theme.primaryForeground }}
              onClick={handleExport}
              disabled={isExporting || !name.trim()}
            >
              {isExporting ? "Exporting..." : "Export Package"}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 py-1 text-xs">
        {exportResult ? (
          <div
            className="p-4 rounded-xl border border-border flex flex-col gap-3"
            style={{ background: theme.sidebarAccent }}
          >
            <div className="flex items-center gap-2.5 text-primary font-semibold text-sm">
              <Icon name="check" size={18} color="currentColor" />
              <span>Instance Exported Successfully</span>
            </div>
            <div className="flex flex-col gap-1 text-muted-foreground font-mono text-[11px] break-all bg-card p-3 rounded-lg border border-border">
              <span className="text-foreground font-bold">{exportResult.fileName}</span>
              <span>{exportResult.outputPath}</span>
              <span className="text-primary font-semibold pt-1">
                Size: {formatBytes(exportResult.sizeBytes)}
              </span>
            </div>
            <p className="text-muted-foreground m-0 leading-relaxed text-[11px]">
              This package is stored in your Downloads folder and can be shared with friends or
              imported directly back into Sera Launcher, Prism Launcher, or MultiMC.
            </p>
          </div>
        ) : (
          <>
            {/* Export File Name */}
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Package Name
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Modpack"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
                  style={{ background: theme.sidebarAccent, color: theme.foreground }}
                />
                <span className="font-mono text-muted-foreground font-semibold px-2">{ext}</span>
              </div>
            </div>

            {/* Target Format Switcher */}
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat("sera_zip")}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    format === "sera_zip"
                      ? "border-primary bg-card shadow-xs"
                      : "border-border bg-secondary hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className="font-bold"
                      style={{ color: format === "sera_zip" ? theme.primary : theme.foreground }}
                    >
                      Universal Archive (.zip)
                    </span>
                    {format === "sera_zip" && <div className="size-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    Directly importable in Sera Launcher, Prism Launcher, and MultiMC
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat("mrpack")}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    format === "mrpack"
                      ? "border-primary bg-card shadow-xs"
                      : "border-border bg-secondary hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className="font-bold"
                      style={{ color: format === "mrpack" ? theme.primary : theme.foreground }}
                    >
                      Modrinth (.mrpack)
                    </span>
                    {format === "mrpack" && <div className="size-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    Index-based format using Modrinth metadata and download URLs
                  </span>
                </button>
              </div>
            </div>

            {/* Content Inclusions */}
            <div className="flex flex-col gap-2 pt-1">
              <label className="font-semibold" style={{ color: theme.foreground }}>
                Include Content
              </label>

              <div
                className="flex flex-col gap-1.5 p-3 rounded-xl border border-border"
                style={{ background: theme.sidebarAccent }}
              >
                <label className="flex items-center gap-2.5 cursor-pointer text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={includeMods}
                    onChange={(e) => setIncludeMods(e.target.checked)}
                    className="accent-primary rounded size-3.5"
                  />
                  <span>Include Installed Mods</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={includeConfigs}
                    onChange={(e) => setIncludeConfigs(e.target.checked)}
                    className="accent-primary rounded size-3.5"
                  />
                  <span>Include Mod Configs & Options</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={includeResourcepacks}
                    onChange={(e) => setIncludeResourcepacks(e.target.checked)}
                    className="accent-primary rounded size-3.5"
                  />
                  <span>Include Resource Packs</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={includeShaderpacks}
                    onChange={(e) => setIncludeShaderpacks(e.target.checked)}
                    className="accent-primary rounded size-3.5"
                  />
                  <span>Include Shader Packs</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-foreground select-none">
                  <input
                    type="checkbox"
                    checked={includeSaves}
                    onChange={(e) => setIncludeSaves(e.target.checked)}
                    className="accent-primary rounded size-3.5"
                  />
                  <span>Include World Saves (Singleplayer)</span>
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
