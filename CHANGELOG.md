# Changelog

All notable changes to SeraLauncher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.4] - 2026-11-07

### Added

- Multi-theme system featuring 6 distinctive color palettes: Sera, Catppuccin, Rosé Pine, Dark+, Dracula, and Tokyo Night.
- Independent light and dark theme pickers to customize active appearance modes.
- Real-time root CSS custom property injection to synchronize Tailwind utilities with active theme tokens.
- Custom `CheckboxDropdown` component with keyboard navigation and animated check states.

### Changed

- Reorganized global settings: introduced a top-level **General** tab with Discord Rich Presence and Updates, merged **Font and layout**, and moved **Theme** under Color scheme.
- Refined UI styling across the application to a borderless presentation, eliminating harsh outlines from category switchers, search inputs, instance cards, and addon lists.
- Zoom percentage indicator relocated beside the zoom step button without preset pill clutter.

### Fixed

- Fixed player model head cropping during Levitation Float by extending camera distance and adding vertical tracking.
- Resolved palette inheritance issues where cards and badges fell back to static stylesheet values.

## [0.2.2] - 2026-11-06

### Added

- Horizon native client support with automatic nightly engine updates.
- Native mod mixin compilation (`.hnmod`) with live real-time compilation log streaming.
- Official Horizon mod registry browsing inside instance addon management.
- Multi-animation player model viewer with Dynamic Idle, Walking, Levitation Float, Elytra Soar, and Sleepy Nod Off.
- Double-click model interaction on Home screen to randomize character animations.
- Dedicated Discord settings tab with live connection status indicators and toggle controls.
- Automatic OTA updates and delta patching powered by MyGo.

### Fixed

- Fixed Elytra Soar animation pitch alignment to prevent torso and shoulder separation.
- Fixed Discord IPC connection handshakes for third-party Discord clients like Vesktop and arRPC.
- Migrated legacy data paths to unified `~/.local/share/SeraLauncher` directory.
