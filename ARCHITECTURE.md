# Architecture

## Goals

- Keep runtime behavior stable while enabling long-term scaling.
- Split UI, domain logic, and persistence into clear modules.
- Make AI-assisted changes safer with predictable file boundaries.

## Directory layout

- `src/App.tsx`: page composition and orchestration only.
- `src/components/`: reusable UI components without business side effects.
- `src/features/drive/`: Drive URL parsing, metadata normalization, and library helpers.
- `src/features/app/`: local storage hydration and persistence functions.
- `src/features/streams/`: stream scheduling and stream-flow domain logic.
- `src/utils/`: generic utilities shared across features.
- `electron/`: Electron main/preload process boundaries and IPC handlers.

## Rules for new code

- Put pure business logic in `src/features/*` first, then call it from `App.tsx`.
- Keep `App.tsx` as orchestrator; avoid adding new data normalization helpers there.
- Add or update unit tests for every new helper in `src/features/*`.
- Preserve existing IPC contracts between renderer and Electron main process.

## Testing strategy

- Unit: `pnpm test:unit` for pure feature modules.
- Smoke: `pnpm test` for stable smoke checks without network dependency.
- Full smoke: `pnpm test:smoke:full` when validating live Drive decode/network path.
- Build gate: `pnpm lint` and `pnpm build` must pass before merge.
