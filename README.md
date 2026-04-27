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
cd D:\Dev\Tool\YT-Multistream-Console
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

## Smoke Test

```powershell
corepack pnpm test:smoke
```

## Notes

- For Google Drive, app converts common share URL formats to direct download URL when possible.
- If ffmpeg is missing, install ffmpeg and restart the app.
