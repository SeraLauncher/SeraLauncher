import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import process from "node:process";

const compatPath = path.resolve(__dirname, "src/compat/tauri.ts");

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": compatPath,
      "@tauri-apps/api/event": compatPath,
      "@tauri-apps/api/window": compatPath,
      "@tauri-apps/plugin-opener": compatPath,
      "@tauri-apps/api": compatPath,
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
}));
