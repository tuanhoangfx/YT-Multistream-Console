# YT Multistream Console

Desktop app for operating multiple YouTube livestream channels from one source set.

## Core Features

- Multi-channel stream queue (start/stop per channel or all channels).
- Source options:
  - local video file from your machine
  - Google Drive share link
- YouTube RTMP output per channel (`rtmp://a.rtmp.youtube.com/live2/<streamKey>`).
- Real-time runtime log from ffmpeg stderr.
- Native dark/light operation console style similar to GPM Automation Console.

## Requirements

- Windows
- Node.js
- `ffmpeg` available in PATH

## Install

```powershell
cd E:\Dev\Tool\YT-Multistream-Console
$env:CI='true'
corepack pnpm install
```

## Run

```powershell
corepack pnpm dev
```

## Build Check

```powershell
corepack pnpm build
```

## Lint

```powershell
corepack pnpm lint
```

## Unit Test

```powershell
corepack pnpm test:unit
```

## Smoke Test

```powershell
corepack pnpm test:smoke
```

## Smoke Test (full alias)

```powershell
corepack pnpm test:smoke:full
```

## Test (stable local/CI)

```powershell
corepack pnpm test
```

## Live Test (optional)

```powershell
corepack pnpm test:live <streamKey>
```

## Developer Workflow

1. Run `corepack pnpm lint`.
2. Run `corepack pnpm test:unit`.
3. Run `corepack pnpm build`.
4. Run `corepack pnpm test`.
5. Update `baocao.md` for notable feature/fix changes.

## Notes

- For Google Drive, app converts common share URL formats to direct download URL when possible.
- If ffmpeg is missing, install ffmpeg and restart the app.
- `test:smoke` runs full checks, including Google Drive decode (network-dependent).
- `test` and `test:smoke:ci` skip the network-dependent Drive decode step.
