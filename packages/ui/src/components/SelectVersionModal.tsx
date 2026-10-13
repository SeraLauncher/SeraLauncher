import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Modal } from "./ui/modal";
import { Dropdown } from "./Dropdown";
import { Badge } from "./ui/badge";
import { recordDownloadHistory } from "../downloads";
import type { Theme } from "../theme";
import type { DiscoveryProject, DiscoveryVersion } from "../instance";

interface SelectVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: DiscoveryProject;
  targetInstanceId: string;
  targetInstanceName: string;
  mcVersion?: string;
  loader?: string | null;
  theme: Theme;
  onInstallStart?: (projectId: string) => void;
  onInstalled?: (installedFiles: string[]) => void;
  onInstallError?: (projectId: string, error: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function SelectVersionModal({
  isOpen,
  onClose,
  project,
  targetInstanceId,
  targetInstanceName,
  mcVersion,
  loader,
  theme,
  onInstallStart,
  onInstalled,
  onInstallError,
}: SelectVersionModalProps) {
  const [versions, setVersions] = useState<DiscoveryVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [modpackInstanceName, setModpackInstanceName] = useState(project.title);
  // installing state handled by parent

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const timer = setTimeout(() => {
      setLoading(true);
    }, 0);

    invoke<DiscoveryVersion[]>("get_discovery_project_versions", {
      provider: project.source,
      projectId: project.id,
      mcVersion: mcVersion ?? null,
      loader: loader ?? null,
    })
      .then(async (res) => {
        if (!active) return;
        let list = res || [];
        if (list.length === 0 && mcVersion) {
          // Fallback to all versions if filtered returned none
          const fallback = await invoke<DiscoveryVersion[]>("get_discovery_project_versions", {
            provider: project.source,
            projectId: project.id,
            mcVersion: null,
            loader: null,
          });
          if (active) list = fallback || [];
        }

        setVersions(list);
        if (list.length > 0) {
          const defaultVer = list.find((v) => v.versionType.toLowerCase() === "release") || list[0];
          setSelectedVersionId(defaultVer.id);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, project.source, project.id, mcVersion, loader]);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) || versions[0];

  const handleInstall = () => {
    if (!selectedVersion || !selectedVersion.downloadUrl) return;

    const isModpack = project.projectType === "modpack";
    const instName = isModpack ? modpackInstanceName.trim() || project.title : targetInstanceName;
    const titleWithVer = `${project.title} (${selectedVersion.versionNumber})`;
    toast.info(`Downloading ${titleWithVer}...`, {
      description: isModpack
        ? `Installing as new instance "${instName}". Check downloads drawer.`
        : `Installing into ${targetInstanceName}. Check header for progress.`,
    });

    // Notify parent to turn card button into "Installing..." immediately
    onInstallStart?.(project.id);
    onClose();

    if (isModpack) {
      invoke("install_modpack_from_discovery", {
        downloadUrl: selectedVersion.downloadUrl,
        customName: instName,
        customIcon: null,
      })
        .then(() => {
          recordDownloadHistory({
            title: titleWithVer,
            instanceName: instName,
            mcVersion,
            status: "completed",
            type: "modpack",
            iconUrl: project.iconUrl,
          });
          toast.success(`Modpack "${instName}" installed successfully!`);
          onInstalled?.([selectedVersion.fileName]);
        })
        .catch((err) => {
          toast.error(`Failed to install modpack ${project.title}`, {
            description: String(err),
          });
          onInstallError?.(project.id, String(err));
        });
      return;
    }

    invoke<string[]>("install_discovery_project", {
      instanceId: targetInstanceId,
      projectType: project.projectType,
      downloadUrl: selectedVersion.downloadUrl,
      fileName: selectedVersion.fileName,
      provider: project.source,
      projectId: project.id,
      versionId: selectedVersion.id,
    })
      .then((installed) => {
        recordDownloadHistory({
          title: titleWithVer,
          instanceName: targetInstanceName,
          mcVersion,
          status: "completed",
          type: project.projectType || "mod",
          iconUrl: project.iconUrl,
        });

        if (installed && installed.length > 1) {
          toast.success(
            `Installed ${project.title} and ${installed.length - 1} required dependencies!`,
            {
              description: installed.slice(1).join(", "),
            },
          );
        } else {
          toast.success(`Installed ${titleWithVer}!`, {
            description: `Saved to ${targetInstanceName}.`,
          });
        }

        onInstalled?.(installed || [selectedVersion.fileName]);
      })
      .catch((err) => {
        toast.error(`Failed to install ${project.title}`, {
          description: String(err),
        });
        onInstallError?.(project.id, String(err));
      });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      title={
        project.projectType === "modpack"
          ? `Install Modpack - ${project.title}`
          : `Select Version - ${project.title}`
      }
      maxWidth={460}
      className="overflow-visible"
      contentClassName="relative z-10 p-4.5 flex flex-col gap-3.5 overflow-visible"
      footer={
        <>
          <button
            type="button"
            className="h-7.5 px-3 rounded-md border-0 bg-transparent text-xs font-medium cursor-pointer transition-colors hover:bg-foreground/5 select-none"
            style={{ color: theme.mutedForeground }}
            onClick={onClose}
            disabled={false}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-7.5 px-3.5 rounded-md border-0 text-xs font-semibold cursor-pointer transition-[opacity,filter] hover:brightness-108 disabled:opacity-50 disabled:cursor-not-allowed select-none"
            style={{ background: theme.primary, color: theme.primaryForeground }}
            onClick={handleInstall}
            disabled={loading || versions.length === 0}
          >
            {project.projectType === "modpack" ? "Install Modpack" : "Install Selected"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        {project.projectType === "modpack" ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold" style={{ color: theme.foreground }}>
              Instance Name
            </label>
            <input
              type="text"
              value={modpackInstanceName}
              onChange={(e) => setModpackInstanceName(e.target.value)}
              placeholder="e.g. Better MC"
              className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs outline-none focus:border-primary transition-colors"
              style={{
                borderColor: theme.border,
                color: theme.foreground,
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Target instance:{" "}
              <strong style={{ color: theme.foreground }}>{targetInstanceName}</strong>
            </span>
            {mcVersion && <span>MC {mcVersion}</span>}
          </div>
        )}

        {loading ? (
          <div className="h-9 px-3 flex items-center rounded-lg border border-border bg-secondary text-xs text-muted-foreground">
            Fetching available versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground rounded-lg border border-border bg-secondary">
            No compatible versions found.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1 relative z-20">
              <label className="text-xs font-semibold" style={{ color: theme.foreground }}>
                Choose Version
              </label>
              <Dropdown
                value={selectedVersionId}
                options={versions.map((v) => v.id)}
                render={(id) => {
                  const ver = versions.find((v) => v.id === id);
                  if (!ver) return id;
                  const typeTag = ver.versionType ? `[${ver.versionType.toUpperCase()}] ` : "";
                  return `${typeTag}${ver.name || ver.versionNumber}`;
                }}
                onChange={(id) => setSelectedVersionId(id)}
                theme={theme}
              />
            </div>

            {selectedVersion && (
              <div
                className="p-3 rounded-xl flex flex-col gap-1.5 text-xs"
                style={{ background: theme.secondary }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    {selectedVersion.name || selectedVersion.versionNumber}
                  </span>
                  <Badge variant="environment">{selectedVersion.versionType.toUpperCase()}</Badge>
                </div>

                <span className="text-[11px] font-mono text-muted-foreground truncate">
                  {selectedVersion.fileName}
                </span>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 flex-wrap">
                  {selectedVersion.gameVersions.length > 0 && (
                    <span>MC: {selectedVersion.gameVersions.slice(0, 3).join(", ")}</span>
                  )}
                  {selectedVersion.loaders.length > 0 && (
                    <>
                      <span>•</span>
                      <span>{selectedVersion.loaders.join(", ")}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatBytes(selectedVersion.fileSize)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
