import { useState } from "react";
import { motion } from "motion/react";
import { Icon } from "./Icon";
import type { Appearance } from "../settings";
import type { Theme } from "../theme";
import { snappy } from "../motion";
import steveGraySkin from "../assets/images/steve-gray-skin.png";

export type Account = {
  username: string;
  uuid?: string;
  avatarUrl?: string;
  skinUrl?: string;
};

/** Official Mojang grayscale Steve texture URL */
export const DEFAULT_STEVE_TEXTURE =
  "http://textures.minecraft.net/texture/adb0e5c6f99e66b74fa84277894b7e4b8f09b2452fb7e486d6ee42b045c26137";

/** renders real minecraft player heads from skin textures or head apis */
export function MinecraftHead({
  username,
  skinUrl,
  avatarUrl,
  size = 20,
  isGray = false,
}: {
  username?: string;
  skinUrl?: string;
  avatarUrl?: string;
  size?: number;
  isGray?: boolean;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  // default to the official grayscale steve texture when no specific skin/user is given
  const isDefaultTexture = !username && !avatarUrl && !skinUrl;
  const activeSkin = skinUrl ?? (isDefaultTexture ? steveGraySkin : undefined);

  if (activeSkin && !loadFailed) {
    // 64x64 skin texture: front face is (8,8) to (16,16), helm layer is (40,8) to (48,16)
    const faceOffset = -size;
    const helmOffset = -size * 5;
    const bgSize = size * 8;

    return (
      <div
        role="img"
        aria-label={username ?? "Minecraft Player Head"}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          backgroundImage: `url("${activeSkin}"), url("${activeSkin}")`,
          backgroundPosition: `${helmOffset}px ${faceOffset}px, ${faceOffset}px ${faceOffset}px`,
          backgroundSize: `${bgSize}px ${bgSize}px, ${bgSize}px ${bgSize}px`,
          backgroundRepeat: "no-repeat, no-repeat",
          imageRendering: "pixelated",
          filter: isGray ? "grayscale(100%)" : "none",
          display: "inline-block",
        }}
      />
    );
  }

  // player head endpoint for usernames or custom avatar URLs
  const headSrc =
    avatarUrl ?? `https://mc-heads.net/avatar/${encodeURIComponent(username ?? "Steve")}/32`;

  return (
    <img
      src={headSrc}
      alt={username ?? "Steve"}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setLoadFailed(true)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        imageRendering: "pixelated",
        filter: isGray ? "grayscale(100%)" : "none",
        display: "block",
      }}
    />
  );
}

export function AppHeader({
  theme,
  appearance,
  onToggleTheme,
  account = null,
}: {
  theme: Theme;
  appearance: Appearance;
  onToggleTheme: () => void;
  account?: Account | null;
}) {
  const hasAccount = Boolean(account && account.username);
  const displayName = hasAccount ? account!.username : "No Account";

  return (
    <header className="app-header" style={{ background: theme.background }}>
      {/* left slot reserved for running task indicators or notifications */}
      <div className="header-left">
        <div className="header-tasks" />
      </div>

      {/* right slot containing plain account info and plain theme toggle icon */}
      <div className="header-right">
        <div className="account-chip" style={{ color: hasAccount ? theme.text : theme.muted }}>
          <MinecraftHead
            username={account?.username}
            skinUrl={account?.skinUrl}
            avatarUrl={account?.avatarUrl}
            size={20}
            isGray={!hasAccount}
          />
          <span className="account-name">{displayName}</span>
        </div>

        {/* theme toggle placed directly to the right of the account info */}
        <motion.button
          type="button"
          className="theme-toggle-btn"
          style={{ color: theme.muted }}
          whileTap={{ scale: 0.9 }}
          transition={snappy}
          onClick={onToggleTheme}
          title={appearance === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={appearance === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon name={appearance === "dark" ? "sun" : "moon"} size={16} color="currentColor" />
        </motion.button>
      </div>
    </header>
  );
}
