# Changelog

All notable changes to SeraLauncher will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
