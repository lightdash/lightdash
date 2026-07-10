---
name: developing-data-apps-locally
description: Use when editing a downloaded Lightdash data app on your machine — how local editing, building, and re-uploading work, and what is read-only.
---

# Developing Lightdash Data Apps Locally

You are editing a Lightdash **data app** that was downloaded with the Lightdash CLI (`lightdash download`).

## The only way to reach data is the SDK

- All data access goes through `@lightdash/query-sdk` (a postMessage bridge to Lightdash). There is **no** `fetch`, no REST calls, no other network access at runtime — anything else is blocked.
- For the SDK surface (query builder, `useLightdash`, filters, downloads), read the `lightdash-data-app` skill in this folder.

## Library boundaries — build with what's preinstalled

- The app builds against a **fixed template dependency set** — see `package.json` (React, Recharts, d3 + d3-cloud/d3-sankey, Radix primitives, Tailwind, lucide-react, date-fns, html-to-image, jspdf, and more). **Design within this set**; it covers almost all data-app needs.
- Adding new npm packages only works when the Lightdash instance has custom dependencies enabled — **assume it does not**. When disabled, upload rejects new dependencies and apps that declare them cannot be downloaded. Do not attempt `pnpm add` to find out; ask the user whether their instance has custom dependencies enabled before considering a new library.
- Do **not** work around a missing library by vendoring its source into `src/`, inlining minified code, or fetching code at runtime. If the template set genuinely cannot express what's asked, say so and let the user decide.

## The edit → build → upload loop

1. Edit files under `src/` only.
2. Optionally, `pnpm install` then `pnpm build` to check it compiles. This is an **optional local pre-check** — see below.
3. `lightdash upload --apps <appUuid>` (the `appUuid` from this folder's `lightdash-app.yml`) — the **server** rebuilds and serves the app. The server rebuild, not your local build, is what ships.

## The local build is optional — never fight a failing install

- If `pnpm install` fails (registry policy, an unavailable pinned SDK version, no network access), **skip the local build entirely and go straight to upload**. The server rebuild is authoritative and surfaces build errors on the app page.
- Do **not** modify machine configuration, `.npmrc` files, registry settings, or the project's dependency files to force an install to work.
- A missing `node_modules` is a normal state, not a problem to fix. Never run installs just because it is absent.
- **Exception — adding a dependency** (only on instances with custom dependencies enabled — see "Library boundaries" above). Upload rejects new dependencies unless `pnpm-lock.yaml` was regenerated to match `package.json`, so dependency resolution MUST succeed locally. Use `pnpm add <pkg>` — prefixed with Socket Firewall when available (`sfw pnpm add <pkg>`; check with `command -v sfw`) to block known-malicious packages — or after editing `package.json` run `pnpm install --lockfile-only` (updates the lockfile without installing). If resolution fails, **stop and report the exact pnpm error to the user** — never hand-edit `package.json` and proceed without the lockfile; the upload will fail.
- **Never run dependency lifecycle scripts.** The app's `.npmrc` sets `ignore-scripts=true` — leave it. A downloaded app can be authored by someone else, and their dependencies' install scripts must not execute on this machine. Explicit `pnpm build`/`pnpm dev` still work.

## Preview locally against real data

`lightdash apps preview` (run in this folder) starts a local dev server that renders the app against the Lightdash instance you are logged into, using your CLI credential. Requires `pnpm install` to have succeeded; if it hasn't, skip preview and rely on the server rebuild.

- Your API key never leaves the CLI process: it is held by a loopback proxy that only forwards the **same routes a deployed app can reach** (the SDK bridge allowlist — query execution, result polling, downloads, current user), pinned to this app's project. No credential is written to any file or exposed to the vite process or the browser. Never put a real key in `.env.local` or any `VITE_`-prefixed var — anything `VITE_*` is inlined into the page and readable by any code running there.
- There is no manual `pnpm dev` equivalent with data access — bare `pnpm dev` starts the page but API calls fail with 401. Always use `lightdash apps preview`.
- An endpoint that works in preview but not when deployed means it is outside the data-app SDK surface — use the SDK, don't work around the proxy.
- Declared custom dependencies work in preview too — the dev server bundles whatever `pnpm install` put in `node_modules`, the same set the server installs on upload.
- Preview shows **your** data under **your** permissions and user attributes — viewers of the deployed app may see different data. Do not treat preview as verification of viewer-specific behavior.
- The dev server applies a CSP that locks network egress to the Lightdash origin, but `script-src` stays permissive (vite needs it), so preview is **not** a full stand-in for the deployed Content-Security-Policy. A library that works in preview may still be blocked when deployed; the app page after upload is the final check.

## Project context (read-only reference)

`.lightdash/context/` holds a point-in-time snapshot of the source project:

- `semantic-layer.yml` — the real tables/dimensions/metrics you can query. Use these exact names.
- `parameters.yml` — project-wide parameters (if any).
- `prompt-history.md` — the prompts used to generate each version.
- `theme/` — styling instructions and assets.

## Read-only files

Most root config is reference only — editing it has **no effect** because the server rebuilds against its trusted template. This applies to `vite.config.js`, `tailwind.config.js`, `tsconfig.json`, and other build/tooling files.

`package.json` is **partially editable** only when custom dependencies are enabled on the Lightdash instance — see "Library boundaries" above; treat it as read-only otherwise. When enabled, you may add npm dependencies with `pnpm add <pkg>` — registry packages with plain semver versions only (no git/file/url specs), up to 60 direct dependencies, and `pnpm-lock.yaml` must be updated alongside (see the exception above — this is the one step that must succeed locally). On upload the CLI warns which packages will be installed in the build sandbox; install scripts never run. Other root config (vite/tailwind/tsconfig) remains read-only.
