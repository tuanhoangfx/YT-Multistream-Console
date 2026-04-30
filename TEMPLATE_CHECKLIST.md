# Tool Template Checklist

Use this checklist when creating or standardizing a desktop tool repository.

## Repository Baseline

- [ ] `package.json`, `tsconfig.json`, `vite.config.ts`, `tool.manifest.json` exist.
- [ ] `pnpm-lock.yaml` is committed.
- [ ] `electron/main.cjs` and `electron/preload.cjs` exist.
- [ ] Core renderer files exist: `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/types.ts`.

## Source Structure

- [ ] Domain-first organization under `src/features/<domain>`.
- [ ] Shared UI pieces under `src/components`.
- [ ] Shared helpers under `src/lib` or `src/utils`.
- [ ] New features include colocated `*.test.ts` or `*.test.tsx` when applicable.

## Scripts Standard

- [ ] Core scripts: `dev`, `build`, `preview`, `start`.
- [ ] Quality scripts: `lint`, `lint:fix`, `format`, `format:check`.
- [ ] Test scripts: `test`, `test:unit`, `test:smoke`, `test:smoke:ci`, `test:live`.
- [ ] Release-governance scripts: `sync:bump`, `sync:meta`, `sync:changelog`, `check:changelog`, `sync:all`, `audit:cleanup`.

## Docs Standard

- [ ] `README.md`
- [ ] `PROJECT_CONTEXT.md`
- [ ] `ARCHITECTURE.md`
- [ ] `CONTRIBUTING.md`
- [ ] `CHANGELOG.md`
- [ ] `RELEASE.md`
- [ ] `TOOL_STATUS.md`

## Manifest Standard

- [ ] `tool.manifest.json` has `schemaVersion`, `id`, `name`, `summary`, `stack`.
- [ ] `commands` includes at least `dev`, `build`, `preview`, `smoke`, `package`.
- [ ] `docs` includes `readme`, `context`, `architecture`, `contributing`, `changelog`, `release`.
- [ ] `release.version` matches `package.json` version.

## Workflow Standard

- [ ] `ci.yml` uses reusable verify workflow.
- [ ] `release.yml` uses reusable release workflow.
- [ ] Reusable verify workflow enforces: metadata sync, changelog check, audit, lint, unit tests, build.
- [ ] Reusable release workflow enforces quality gates before `dist`.

## Final Verification

- [ ] `pnpm install`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit`
- [ ] `pnpm build`
- [ ] `pnpm check:changelog`
- [ ] `pnpm audit:cleanup`
