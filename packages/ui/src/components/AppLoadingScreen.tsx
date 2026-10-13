import { motion } from "motion/react";
import { logo, type Theme } from "../theme";
import { APP_VERSION } from "../settings";
import type { Appearance } from "../settings";
import { fade } from "../motion";

interface AppLoadingScreenProps {
  appearance: Appearance;
  theme: Theme;
  progress: number; // 0 to 100
}

export function AppLoadingScreen({ appearance, theme, progress }: AppLoadingScreenProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <motion.div
      key="app-loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ ...fade, duration: 0.35 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{
        background: theme.background,
        color: theme.foreground,
      }}
    >
      {/* Centered logo and progress bar */}
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="flex items-center justify-center">
          <img
            src={logo[appearance]}
            alt="Sera Launcher"
            width={72}
            height={72}
            className="drop-shadow-md"
            draggable={false}
          />
        </div>

        {/* Progress bar below the logo */}
        <div
          className="w-48 h-1.5 rounded-full overflow-hidden"
          style={{ background: theme.secondary }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: theme.primary }}
            initial={{ width: "0%" }}
            animate={{ width: `${clamped}%` }}
            transition={{ ease: "easeOut", duration: 0.2 }}
          />
        </div>
      </div>

      {/* Version displayed at the bottom corner */}
      <div
        className="absolute bottom-5 left-6 text-xs font-mono select-none"
        style={{ color: theme.mutedForeground }}
      >
        v{APP_VERSION}
      </div>
    </motion.div>
  );
}
