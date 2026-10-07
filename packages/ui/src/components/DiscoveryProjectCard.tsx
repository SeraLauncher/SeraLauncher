import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icon";
import { Badge } from "./ui/badge";
import type { Theme } from "../theme";
import type { DiscoveryProject } from "../instance";

function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    return `${Math.floor(diffMonth / 12)}y ago`;
  } catch {
    return "";
  }
}

interface DiscoveryProjectCardProps {
  item: DiscoveryProject;
  theme: Theme;
  onClick: () => void;
  onInstall?: (e: React.MouseEvent) => void;
  isInstalling?: boolean;
  isInstalled?: boolean;
  installLabel?: string;
}

export function DiscoveryProjectCard({
  item,
  theme,
  onClick,
  onInstall,
  isInstalling = false,
  isInstalled = false,
  installLabel = "Install",
}: DiscoveryProjectCardProps) {
  const dlCount =
    item.downloads >= 1_000_000
      ? `${(item.downloads / 1_000_000).toFixed(1)}M`
      : item.downloads >= 1_000
        ? `${Math.round(item.downloads / 1_000)}k`
        : `${item.downloads}`;

  const followCount = item.follows
    ? item.follows >= 1_000_000
      ? `${(item.follows / 1_000_000).toFixed(1)}M`
      : item.follows >= 1_000
        ? `${Math.round(item.follows / 1_000)}k`
        : `${item.follows}`
    : null;

  const [imgError, setImgError] = useState(false);
  const timeLabel = formatRelativeTime(item.dateModified);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => {
        invoke("get_discovery_project_details", {
          provider: item.source,
          projectId: item.id,
        }).catch(() => {});
      }}
      className="flex items-start justify-between p-3 rounded-xl border border-border gap-3.5 transition-all hover:shadow-md cursor-pointer select-none"
      style={{ background: theme.card }}
    >
      {/* Left: Thumbnail & Content */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {item.iconUrl && !imgError ? (
          <img
            src={item.iconUrl}
            alt=""
            onError={() => setImgError(true)}
            className="w-[72px] h-[72px] rounded-xl object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div
            className="w-[72px] h-[72px] rounded-xl flex items-center justify-center flex-shrink-0 border border-border"
            style={{ background: theme.secondary }}
          >
            <Icon name="cubes" size={26} color={theme.mutedForeground} />
          </div>
        )}

        <div className="flex-1 min-w-0 h-[72px] flex flex-col justify-between">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className="text-sm font-semibold truncate leading-none"
                style={{ color: theme.foreground }}
                title={item.title}
              >
                {item.title}
              </h3>
              <span
                className="text-xs flex-shrink-0 leading-none"
                style={{ color: theme.mutedForeground }}
              >
                by {item.author}
              </span>
            </div>

            <p
              className="text-xs line-clamp-2 mt-1 leading-snug overflow-hidden"
              style={{ color: theme.mutedForeground }}
            >
              {item.description}
            </p>
          </div>

          {/* Badges flush with image bottom */}
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {item.environment === "both" && (
              <Badge
                variant="environment"
                icon={<Icon name="globe" size={12} color={theme.primary} />}
              >
                Client & Server
              </Badge>
            )}
            {item.environment === "client" && (
              <Badge
                variant="environment"
                icon={<Icon name="computer" size={12} color={theme.primary} />}
              >
                Client
              </Badge>
            )}
            {item.environment === "server" && (
              <Badge
                variant="environment"
                icon={<Icon name="server" size={12} color={theme.primary} />}
              >
                Server
              </Badge>
            )}

            {item.categories.slice(0, 4).map((cat) => (
              <Badge key={cat} variant="environment">
                {capitalizeFirst(cat)}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Install Button & Metrics */}
      <div className="h-[72px] flex flex-col justify-between items-end flex-shrink-0 pl-2">
        <button
          type="button"
          disabled={isInstalling}
          onClick={(e) => {
            if (onInstall) {
              e.stopPropagation();
              onInstall(e);
            } else {
              onClick();
            }
          }}
          className="h-[26px] px-3 text-xs font-semibold rounded-md transition-opacity hover:opacity-90 cursor-pointer flex items-center justify-center leading-none disabled:opacity-60"
          style={{
            background: isInstalled ? theme.success : theme.primary,
            color: theme.primaryForeground,
          }}
        >
          {isInstalling ? "Installing..." : isInstalled ? "Installed" : installLabel}
        </button>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: theme.mutedForeground }}
          >
            <div
              className="inline-flex items-center gap-1 font-medium leading-none"
              title="Downloads"
            >
              <Icon name="download" size={11} color="currentColor" />
              <span>{dlCount}</span>
            </div>

            {followCount && (
              <div
                className="inline-flex items-center gap-1 font-medium leading-none"
                title="Likes / Follows"
              >
                <Icon name="heart" size={11} color="currentColor" />
                <span>{followCount}</span>
              </div>
            )}
          </div>

          {timeLabel && (
            <div
              className="inline-flex items-center gap-1 text-[11px] font-medium leading-none"
              title={`Updated: ${item.dateModified}`}
              style={{ color: theme.mutedForeground }}
            >
              <Icon name="clock" size={11} color={theme.primary} />
              <span>{timeLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
