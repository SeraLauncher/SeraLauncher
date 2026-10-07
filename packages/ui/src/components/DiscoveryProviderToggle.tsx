import { SiCurseforge, SiModrinth } from "./Icon";
import type { Theme } from "../theme";

export type DiscoveryProvider = "modrinth" | "curseforge";

interface DiscoveryProviderToggleProps {
  provider: DiscoveryProvider;
  onChange: (provider: DiscoveryProvider) => void;
  theme: Theme;
  className?: string;
}

export function DiscoveryProviderToggle({
  provider,
  onChange,
  theme,
  className = "",
}: DiscoveryProviderToggleProps) {
  return (
    <div
      className={`flex items-center p-0.5 rounded-lg border border-border gap-0.5 ${className}`}
      style={{ background: theme.secondary }}
    >
      <button
        type="button"
        onClick={() => onChange("modrinth")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer select-none"
        style={{
          background: provider === "modrinth" ? theme.primary : "transparent",
          color: provider === "modrinth" ? theme.primaryForeground : theme.mutedForeground,
          fontWeight: provider === "modrinth" ? 600 : 500,
          fontSize: "0.82rem",
          lineHeight: 1.2,
        }}
      >
        <SiModrinth size={14} color="currentColor" />
        <span>Modrinth</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("curseforge")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer select-none"
        style={{
          background: provider === "curseforge" ? theme.primary : "transparent",
          color: provider === "curseforge" ? theme.primaryForeground : theme.mutedForeground,
          fontWeight: provider === "curseforge" ? 600 : 500,
          fontSize: "0.82rem",
          lineHeight: 1.2,
        }}
      >
        <SiCurseforge size={14} color="currentColor" />
        <span>CurseForge</span>
      </button>
    </div>
  );
}
