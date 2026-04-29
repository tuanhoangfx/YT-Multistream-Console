# Release Guide

Release and distribution process for `YT Multistream Console`.

## Requirements

- `package.json` version is bumped before release.
- `CHANGELOG.md` has a top entry for the new version.
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

## Optional Desktop Packaging

If you add Electron Builder packaging later, keep the packaging scripts in `package.json` and document output paths here.

## Publish Checklist

1. Bump `package.json` version.
2. Add changelog entry with:
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

