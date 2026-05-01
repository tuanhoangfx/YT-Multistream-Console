# Release Guide

Release and distribution process for `YT Multistream Console`.

## 2026-05-01 - Automation Update 0.1.12

- Version: `0.1.12`
- Timestamp: 2026-05-01 19:23 (UTC+7)
- Commit: `118723a`
- Type: Maintenance/Automation
- Status: Verified

### Changes

- Updated source version to `0.1.12` and synced release metadata.
- Updated `.githooks/post-commit`.
- Updated `.githooks/pre-commit`.
- Updated `scripts/check-version-sync.mjs`.


### Verification

```powershell
pnpm sync:all
pnpm build
```

Result: passed.


## 2026-05-01 - Code Update 0.1.11

- Version: `0.1.11`
- Timestamp: 2026-05-01 19:01 (UTC+7)
- Commit: `8d4250d`
- Type: Feature/Fix
- Status: Verified

### Changes

- Updated source version to `0.1.11` and synced release metadata.
- Updated `.githooks/post-commit`.
- Updated `.githooks/pre-commit`.
- Updated `.githooks/pre-push`.
- Updated `.github/workflows/_reusable-verify.yml`.
- Updated `CHANGELOG.md`.
- Additional updated files: +19.

### Verification

```powershell
pnpm sync:all
pnpm build
```

Result: passed.


## 2026-05-01 - Tokenized Dropdown Width Policy

- Version: `0.1.10`
- Timestamp: 2026-05-01 19:00 (UTC+7)
- Commit: pending
- Type: UI/CSS/Standards
- Status: Verified

### Changes

- Replaced hardcoded dropdown widths with CSS tokens in the tool stylesheet for filter/config/menu contexts.
- Added explicit dropdown width policy to workspace standards to prevent future divergence.
- Kept compact dropdown behavior and offsets aligned with existing standards.
- Synced version metadata to `0.1.10` across `package.json`, `tool.manifest.json`, and `RELEASE.md`.

### Verification

```powershell
npm run lint
npm run build
```

Result: passed.

## 2026-05-01 - Dropdown Size Normalization And Space Optimization

- Version: `0.1.9`
- Timestamp: 2026-05-01 18:57 (UTC+7)
- Commit: pending
- Type: UI/UX/CSS
- Status: Verified

### Changes

- Aligned filter-row dropdown width to standards baseline (`180px`) for consistent sizing in queue/library filters.
- Normalized Stream Config field widths for source type, run mode, and publish mode (`190px`) to remove inconsistent control sizing.
- Optimized dropdown menu footprint using adaptive width (`max(100%, 180px)` with `max-width: 240px`) so menus do not over-occupy space.
- Preserved standards-required behavior for compact control height (`32px`) and menu offset (`top: calc(100% + 6px)`).
- Synced version metadata to `0.1.9` across `package.json`, `tool.manifest.json`, and `RELEASE.md`.

### Verification

```powershell
npm run lint
npm run build
```

Result: passed.

## 2026-05-01 - Full English UI Terminology Pass

- Version: `0.1.8`
- Timestamp: 2026-05-01 18:52 (UTC+7)
- Commit: pending
- Type: UI/Text
- Status: Verified

### Changes

- Converted remaining Vietnamese UI strings to English in Stream Config and Run mode dropdowns.
- Updated schedule terminology from `Public ngay` to `Publish now` and label from `Chế độ phát` to `Publish mode`.
- Updated run mode option label from `Xoay vòng` to `Loop` to keep tool terminology fully English.
- Synced version metadata to `0.1.8` across `package.json`, `tool.manifest.json`, and `RELEASE.md`.

### Verification

```powershell
npm run lint
```

Result: passed.

## 2026-04-30 - Dropdown Standardization And Schedule UX Alignment

- Version: `0.1.7`
- Timestamp: 2026-04-30 23:45 (UTC+7)
- Commit: pending
- Type: UI/UX/Fix
- Status: Verified

### Changes

- Replaced `Public ngay/Schedule` radio controls in Stream Config with standardized `SmartFilterDropdown`.
- Standardized pagination size selectors to `SmartFilterDropdown` for consistent dropdown behavior across screens.
- Updated Stream Config layout overflow behavior so schedule/source dropdown data is not clipped when fields expand or change.
- Synced version metadata to `0.1.7` across `package.json`, `tool.manifest.json`, and `RELEASE.md`.

### Verification

```powershell
npm run lint
npm run build
```

Result: passed.

## 2026-04-30 - Code Update 0.1.1

- Version: `0.1.1`
- Timestamp: 2026-04-30 17:42 (UTC+7)
- Commit: `8d4250d`
- Type: Feature/Fix
- Status: Verified

### Changes

- Updated release log UI data source to avoid stale hard-coded entries.
- Synced version metadata to `0.1.1` across `package.json`, `tool.manifest.json`, and `RELEASE.md`.
- Standardized release pipeline and hooks with code-change-only stamping.

### Verification

```powershell
pnpm sync:all
pnpm build
```

Result: passed.


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

## Requirements

- `package.json` version is bumped before release.
- `RELEASE.md` has a top entry for the new version.
- Smoke test passes before publishing.
- GitHub token is available only as a temporary environment variable.

## Local Build And Verification

```powershell
cd E:\Dev\Tool\YT-Multistream-Console
corepack pnpm install
corepack pnpm build
corepack pnpm test:smoke
```

Expected web build output:

```text
dist\index.html
dist\assets\index-*.js
dist\assets\index-*.css
```

## Desktop Packaging

Create installer artifacts with Electron Builder:

```powershell
cd E:\Dev\Tool\YT-Multistream-Console
corepack pnpm dist
```

Expected packaging output:

```text
release\nsis-web\YT-Multistream-Console-Setup-<version>.exe
release\nsis-web\yt-multistream-console-<version>-x64.nsis.7z
release\nsis-web\latest.yml
```

## Publish Checklist

1. Bump `package.json` version.
2. Add release entry with:
   - changed files,
   - verification commands,
   - rollback command.
3. Run:
   - `corepack pnpm build`
   - `corepack pnpm test:smoke`
4. Validate that stream keys remain masked in logs.
5. Push/tag/release on GitHub.

## Rollback

```powershell
cd E:\Dev\Tool\YT-Multistream-Console
git revert <commit_hash>
```

