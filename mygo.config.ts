import { defineConfig } from "mygo-cli";

export default defineConfig({
  name: "SeraLauncher",
  identifier: "com.yoruakio.seralauncher",
  version: "0.2.2",
  // `mygo dev` runs devCommand and loads devUrl; `mygo build` runs
  // buildCommand and embeds frontendDist into the app.
  devUrl: "http://localhost:1420",
  devCommand: "bun run dev:web",
  buildCommand: "bun run build:web",
  frontendDist: "apps/client/dist",
  bindings: "apps/client/src/mygo.ts",
  out: "build",
});
