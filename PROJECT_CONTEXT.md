# Project Context

Living context file for `YT Multistream Console`.

## Project Identity

- Project code: `P0002`
- Canonical short reference: `P0002-YT-Multistream-Console`
- Machine-readable manifest: `tool.manifest.json`
- Code index location: `E:\Dev\Rules\indexes\PROJECT_INDEX.md`

## Product Goal

Build a local desktop console that can run multi-channel YouTube livestream jobs from:

- Local video files
- Google Drive links

The main operator workflow is:

1. Configure channel outputs and stream keys.
2. Pick one source per channel.
3. Start/stop selected channels or run all channels in batch.
4. Watch runtime log and failure states.

## Current Direction

- Product type: Electron desktop app.
- UI direction: Native operation console.
- Main language: English.
- Main layout: left queue / right config and console.
- Theme: dark/light.

## Current Features

- Channel queue with per-channel status.
- Add channel preset.
- Start selected stream and stop selected stream.
- Start all streams and stop all streams.
- Source switching between local file and Google Drive URL.
- ffmpeg availability check.
- Runtime event log from stream worker process.

## Next Development Suggestions

- Add stream profile templates (720p, 1080p, low bandwidth).
- Add queue-level retry policy and auto-restart.
- Add scheduler (start at time, stop at time).
- Add optional loop strategy per source list.
- Persist run history in SQLite.
- Package with `electron-builder`.
