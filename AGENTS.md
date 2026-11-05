# AGENTS.md

Welcome to SeraGo. This document provides coding agents with repository knowledge, architectural conventions, operational commands, and guidelines for working within this codebase.

---

## 1. Project Overview

SeraGo is a modern Minecraft launcher desktop application built with:

- **Desktop Framework**: MyGo (pure Go desktop application framework without cgo).
- **Backend**: Go 1.27+ with pure Go libraries.
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, and Motion.
- **Package Management**: Bun workspaces within a monorepo.

## 2. Essential Commands

### Development Setup

```bash
# Install all JavaScript / TypeScript dependencies using Bun
bun install

# Download Go dependencies
go mod tidy
```

### Development Server

```bash
# Run full desktop application in development mode (hot reload)
bun run dev
# Or directly via MyGo CLI:
mygo dev

# Run only the web frontend dev server (Vite on localhost:5173)
bun run dev:web
```

### TypeScript IPC Client Generation

```bash
# Generate TypeScript definitions and client in src/mygo.ts from Go services
bun run generate
# Or:
mygo generate
```

### Build & Typecheck

```bash
# Typecheck TypeScript across all workspaces
bun run check

# Build frontend assets for production
bun run build:web

# Build desktop production binary (pure Go, no cgo required)
bun run build
# Or:
mygo build
```

### Testing

```bash
# Run all Go unit tests
go test ./...

# Run tests for a specific package with verbose output
go test -v ./internal/settings/...
```

---

## 3. Architecture & Coding Conventions

### Backend (Go)

1. **Pure Go (Zero cgo)**: Never introduce cgo or packages that require external C compilers. Ensure pure Go compatibility across Linux, macOS, and Windows.
2. **Service Binding**: Services exposed to the frontend are Go structs registered via `mygo.Bind()` in `main.go`.
3. **Exported Methods**: Methods on bound services must take JSON-serializable parameters and return `(T, error)` or `T`.
4. **Error Handling**: Return clean, user-friendly error strings. Never panic on unreadable disk files; fall back to safe default configurations.
5. **Concurrency**: Use Goroutines, channels, and `sync` primitives. Avoid global mutable state without mutex protection.
6. **Functional Comments**: Write functional code comments in lowercase explaining logic notes and parameter/return information. Never mention AI or system instructions.

### Frontend (React / TypeScript)

1. **Toolchain**: Use Bun as package manager and runner.
2. **Components**: Functional React 19 components with strict TypeScript types.
3. **Styling**: Tailwind CSS v4 using CSS custom properties (`--background`, `--foreground`, `--sidebar`).
4. **Animations**: Motion (formerly Framer Motion) respecting user preference for reduced motion.
5. **IPC Access**: Call generated services from `src/mygo.ts` or through `src/compat/tauri.ts` bridge during transition.

---

## 4. Coding Agent Guidelines

1. **Simplicity First**: Implement the minimal, robust code needed. Avoid speculative abstractions and single-use interfaces.
2. **Keep Monorepo Intact**: Maintain package separation between `@sera/ui`, `@sera/player-model`, and `@sera/client`.
3. **Asset Preservation**: Fonts, logos, block textures, and icons are stored in `packages/ui/src/assets/` and `resources/icons/`. Do not delete or rename asset files.
4. **Check Work**: Always run `bun run check` and `go test ./...` after making code changes.
