---
name: developing-data-apps-locally
description: Use when editing a downloaded Lightdash data app on your machine — how local editing, building, and re-uploading work, and what is read-only.
---

# Developing Lightdash Data Apps Locally

You are editing a Lightdash **data app** that was downloaded with `lightdash download --apps`.

## The only way to reach data is the SDK
- All data access goes through `@lightdash/query-sdk` (a postMessage bridge to Lightdash). There is **no** `fetch`, no REST calls, no other network access at runtime — anything else is blocked.
- For the SDK surface (query builder, `useLightdash`, filters, downloads), read the `lightdash-data-app` skill in this folder.

## The edit → build → upload loop
1. Edit files under `src/` only.
2. `pnpm install` then `pnpm build` to check it compiles. This is a **local pre-check**.
3. `lightdash upload --apps` — the **server** rebuilds and serves the app. The server rebuild, not your local build, is what ships.

## Project context (read-only reference)
`.lightdash/context/` holds a point-in-time snapshot of the source project:
- `semantic-layer.yml` — the real tables/dimensions/metrics you can query. Use these exact names.
- `parameters.yml` — project-wide parameters (if any).
- `prompt-history.md` — the prompts used to generate each version.
- `theme/` — styling instructions and assets.

## Read-only files
Root config (`package.json`, `vite.config.js`, `tailwind.config.js`, `tsconfig.json`, etc.) is reference only. Editing it has **no effect** — the server rebuilds against its trusted template. Adding dependencies or changing the build is not supported yet.
