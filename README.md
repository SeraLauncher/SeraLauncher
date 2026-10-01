# Sera

A Minecraft launcher built with Tauri 2, React 19 and Rust.

Sera is a desktop launcher for managing Minecraft instances and the mods, resource
packs and shaders that go with them.

## Status

Early. The shell, theme and settings are built; the pages behind the rail are not
there yet.

## Requirements

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs)
- Tauri 2's [system dependencies](https://tauri.app/start/prerequisites/)

## Running it

```sh
bun install
bun run tauri dev
```

## Checks

```sh
bun run check          # lint + format check + typecheck
bun run format         # write formatting
bun run lint           # oxlint
cd apps/client/src-tauri && cargo test
```

`oxfmt` skips `apps/*/src-tauri/` and `package.json`; see `.oxfmtignore`.

## Assets

- **Typeface** — [Sunghyun Sans](https://github.com/anaclumos/sunghyun-sans), SIL Open
  Font License. Four weights ship in `src/assets/fonts/` alongside the licence text.
- **Icons** — [Tabler](https://tabler.io/icons) (MIT), inlined as path data in
  `src/components/Icon.tsx`. They are inlined rather than loaded as files so
  `currentColor` resolves in this document; an `<img>`-loaded SVG cannot see the
  theme's colour.
- **Logo** — `sera-dark.png` and `sera-light.png`, the variant drawn on each shell.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
