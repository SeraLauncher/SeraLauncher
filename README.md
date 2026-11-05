# SeraLauncher

A modern, lightweight Minecraft launcher desktop application built with MyGo, pure Go, React 19, and Vite.

SeraLauncher is a cross-platform desktop launcher for managing Minecraft instances, mod loaders, addons, and custom client runtimes with zero cgo dependencies.

---

## Features

- **Multi-Loader Support**: First-class support for Vanilla, Fabric, Quilt, Forge, and NeoForge.
- **Horizon Engine Support**: Dedicated creation and management for the Horizon Rust-based Minecraft 26.3 client, including official Horizon mod registry browsing, live GitHub release tracking, and native mixin compilation (`.hnmod`).
- **Addon Discovery**: Integrated Modrinth and CurseForge browser with one-click installation and automatic dependency resolution for mods, resource packs, and shader packs.
- **Account Management**: Support for Microsoft OAuth, Ely.by, LittleSkin (custom authlib-injector), and offline player profiles.
- **Managed Java Runtimes**: Automated detection of system runtimes alongside isolated Adoptium Eclipse Temurin JDK installations (Java 8, 17, 21, and 25).
- **World Management & Backups**: World discovery, one-click zip backup archives, and restoration.
- **Server Monitoring**: Real-time Server List Ping (SLP) protocol integration with live latency, player counts, and server icons.
- **Discord Rich Presence**: Live desktop IPC status updates displaying active game instances and session details.

---

## Tech Stack

- **Desktop Framework**: [MyGo](https://github.com/egoist/mygo) (pure Go desktop framework without cgo)
- **Backend**: Go 1.27+ with pure Go libraries
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, and Motion
- **3D Viewer**: Three.js skin and player head rendering in `@sera/player-model`
- **Package Management**: Bun workspaces within a monorepo

---

## Requirements

- [Bun](https://bun.sh) (v1.2+)
- [Go](https://go.dev) (v1.27+)
- WebKitGTK 2.16+ (Linux only)

---

## Development

Install JavaScript dependencies and tidy Go modules:

```bash
bun install
go mod tidy
```

Start the full desktop application in development mode with hot reload:

```bash
bun run dev
```

Run only the Vite frontend dev server (useful for browser inspection at `localhost:1420`):

```bash
bun run dev:web
```

---

## Building

Typecheck all workspaces:

```bash
bun run check
```

Build the frontend web assets:

```bash
bun run build:web
```

Build the production desktop binary:

```bash
bun run build
```

Run all Go backend tests:

```bash
go test ./...
```

---

## Versioning

Bump the application and workspace package versions using the automated bump script:

```bash
bun run bump-version patch
bun run bump-version minor
bun run bump-version major
bun run bump-version 0.2.3
```

---

## Assets & Attribution

- **Typeface**: [Sunghyun Sans](https://github.com/anaclumos/sunghyun-sans) (SIL Open Font License) in `packages/ui/src/assets/fonts/`.
- **Icons**: [Tabler Icons](https://tabler.io/icons) (MIT) and Minecraft block textures in `packages/ui/src/assets/`.
- **Branding**: `resources/icons/` and `packages/ui/src/assets/`.

---

## License

GPL-3.0. See [LICENSE](LICENSE).
