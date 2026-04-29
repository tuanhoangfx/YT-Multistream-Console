# Changelog

## 2026-04-28 - Project Manifest Identity

- Version: `0.1.0`
- Timestamp: 2026-04-28 18:47 (UTC+7)
- Commit: pending
- Type: Metadata/Governance
- Status: Verified

### Changes

- Added `tool.manifest.json` as the machine-readable project manifest.
- Assigned stable project code `P0002` for future operator and Codex references.
- Updated `PROJECT_CONTEXT.md` with project identity metadata and the workspace-level project index location.

### Verification

- `Unified Tool Admin` scanner reads `P0002` from `tool.manifest.json`.
- Unified search for `P0002` resolves to `YT Multistream Console`.

## 2026-04-26 - Stability Pass For Direct Streaming Test

- Version: `0.1.0`
- Timestamp: 2026-04-26 19:20 (UTC+7)
- Commit: pending
- Type: Fix/Stability/UI
- Status: Stable

### Changes

- Added bundled ffmpeg runtime (`@ffmpeg-installer/ffmpeg`) so streaming works without system PATH setup.
- Added primary and backup RTMP output support with single ffmpeg process (`tee` muxer).
- Added RTMP validation to catch missing stream key in both primary and backup URLs.
- Added stream key masking in runtime logs to reduce sensitive key exposure.
- Improved migration for older saved channel configs.
- Enhanced UI with animated background glow, pulse status, hover transitions, and visual badges.
- Added automated smoke test command `corepack pnpm test:smoke`.

### Verification

- `corepack pnpm build` passed.
- `corepack pnpm test:smoke` passed:
  - ffmpeg binary check
  - local sample video encode
  - multi-output tee simulation
  - Google Drive source decode

## 2026-04-26 - Initial Multistream Console Baseline

- Version: `0.1.0`
- Timestamp: 2026-04-26 18:30 (UTC+7)
- Commit: pending
- Type: Feature/Baseline
- Status: Stable draft

### Changes

- New Electron + React desktop tool: `YT Multistream Console`.
- Multi-channel queue with per-channel config.
- Source support:
  - local video file
  - Google Drive URL
- ffmpeg-based streaming process manager in Electron main process.
- Runtime log bridge from main process to renderer.
- Start/Stop controls:
  - start selected
  - stop selected
  - start all
  - stop all
- Dark/light native operation UI pattern aligned with GPM tool style.
- Project context and working rules baseline.
