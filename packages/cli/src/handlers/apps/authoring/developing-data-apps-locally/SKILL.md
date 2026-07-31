---
name: developing-data-apps-locally
description: Use when editing a locally created or downloaded Lightdash data app — how local editing, building, and uploading work, and what is read-only.
---

# Developing Lightdash Data Apps Locally

You are editing a Lightdash **data app** that was created or downloaded with the Lightdash CLI.

## The only way to reach data is the SDK

- All app data access goes through `@lightdash/query-sdk`. Deployed apps use Lightdash's postMessage bridge; `lightdash apps preview` uses a loopback proxy restricted to the same SDK routes and project. Do not add direct `fetch` or REST calls.
- For the SDK surface (query builder, `useLightdash`, filters, downloads), read the `lightdash-data-app` skill in this folder.

## External HTTP APIs go through linked connections

- The one sanctioned path to a third-party API is `lightdash.externalFetch('<alias>', ...)` against an **external connection** a project admin configured and linked to this app (see the `lightdash-data-app` skill).
- The app's links are declared in this folder's `lightdash-app.yml` under `externalConnections` (`- alias: stripe` / `connectionSlug: stripe-api`). When the key is present, upload reconciles the app's links to match it exactly — so to link a connection that **already exists in the project**, add its `{alias, connectionSlug}` entry and upload. Do not remove entries casually: an entry removed from the list (or an empty list) unlinks on upload, and a manifest without the key leaves links unchanged.
- Watch the upload output: a `connectionSlug` that doesn't exist in the target project is skipped with a warning (the app uploads, but `externalFetch` on that alias fails at runtime), and linking requires the admin-level `manage:ExternalConnection` permission — if a link is skipped or forbidden, report it to the user instead of retrying.
- If the app needs an API with **no existing connection**, **stop and say so** — do not vendor an HTTP client or try to reach it another way. An admin must create the connection first (in project settings, or as code: `lightdash download --include-external-connections`, edit `lightdash/external-connections/<slug>.yml`, `lightdash upload` with the secret in `LIGHTDASH_EXTERNAL_CONNECTION_SECRET_<SLUG>`); then it can be linked via the manifest as above.

## Library boundaries — build with what's preinstalled

- The app builds against a **fixed template dependency set** — see `package.json` (React, Recharts, d3 + d3-cloud/d3-sankey, Radix primitives, Tailwind, lucide-react, date-fns, html-to-image, jspdf, and more). **Design within this set**; it covers almost all data-app needs.
- Adding new npm packages only works when the Lightdash organization has custom dependencies enabled — **assume it does not**. When disabled, upload rejects new dependency declarations. Do not attempt `pnpm add` to find out; ask the user whether their organization has custom dependencies enabled before considering a new library.
- Do **not** work around a missing library by vendoring its source into `src/`, inlining minified code, or fetching code at runtime. If the template set genuinely cannot express what's asked, say so and let the user decide.

## The edit → build → upload loop

1. Edit files under `src/` only.
2. Optionally, run `npm run build` to check it compiles. Apps made with `lightdash apps create` already have their initial dependencies installed. After `lightdash download`, if you choose to do the local pre-check and `node_modules` is absent, run `npm install` first. This is an **optional local pre-check** — see below.
3. `lightdash upload --apps <slug>` (the `slug` from this folder's `lightdash-app.yml`) — the **server** rebuilds and serves the app. The server rebuild, not your local build, is what ships.

## The local build is optional — never fight a failing install

- If `npm install` fails (registry policy, an unavailable pinned SDK version, no network access), **skip the local build entirely and go straight to upload**. The server rebuild is authoritative and surfaces build errors on the app page.
- Do **not** modify machine configuration, `.npmrc` files, registry settings, or the project's dependency files to force an install to work.
- A missing `node_modules` is a normal state, not a problem to fix. Never run installs just because it is absent.
- **Exception — adding a dependency** (only for organizations with custom dependencies enabled — see "Library boundaries" above). This is the one workflow that still requires pnpm: upload rejects new dependencies unless `pnpm-lock.yaml` was regenerated to match `package.json`, so dependency resolution MUST succeed locally. Use `pnpm add <pkg>` — prefixed with Socket Firewall when available (`sfw pnpm add <pkg>`; check with `command -v sfw`) to block known-malicious packages — or after editing `package.json` run `pnpm install --lockfile-only` (updates the lockfile without installing). If resolution fails, **stop and report the exact pnpm error to the user** — never hand-edit `package.json` and proceed without the lockfile; the upload will fail.
- **Never run dependency lifecycle scripts.** The app's `.npmrc` sets `ignore-scripts=true` — leave it. A downloaded app can be authored by someone else, and their dependencies' install scripts must not execute on this machine. Explicit `npm run build`/`npm run dev` and `pnpm build`/`pnpm dev` commands still work.

## Preview locally against real data

`lightdash apps preview` (run in this folder) starts a local dev server that renders the app against the Lightdash instance you are logged into, using your CLI credential. Requires `npm install` to have succeeded; if it hasn't, skip preview and rely on the server rebuild.

- Preview does not pass your API key to vite or browser code: the CLI holds it behind a loopback proxy that only forwards the SDK route allowlist (query execution, result polling, downloads, current user), pinned to this app's project. No credential is written to the app folder. Never put a real key in `.env.local` or any `VITE_`-prefixed var — anything `VITE_*` is inlined into the page and readable by any code running there.
- There is no manual `npm run dev` equivalent with data access — bare `npm run dev` starts the page but API calls fail with 401. Always use `lightdash apps preview`.
- An endpoint that works in preview but not when deployed means it is outside the data-app SDK surface — use the SDK, don't work around the proxy.
- Declared custom dependencies work in preview too — the dev server bundles whatever the dependency install put in `node_modules`, the same set the server installs on upload.
- Preview shows **your** data under **your** permissions and user attributes — viewers of the deployed app may see different data. Do not treat preview as verification of viewer-specific behavior.
- Local preview keeps the credential out of the app environment/browser but is **not a sandbox**: vite and the downloaded tooling execute as your OS user, can read that user's files (including the existing CLI config), and the app can read the query results it requests. Only preview source and dependencies you trust.
- The dev server applies a CSP that forces API traffic through its same-origin proxy, but `script-src` stays permissive (vite needs it), so preview is **not** a full stand-in for the deployed Content-Security-Policy. A library that works in preview may still be blocked when deployed; the app page after upload is the final check.
- Host-mediated features are not emulated locally. External connections (`externalFetch`), data-app-viz row/field context, Google Sheets export, the product inspector, and product URL-state integration must be tested after upload.

## Project context (read-only reference)

`.lightdash/context/` holds a point-in-time snapshot of the source project:

- `semantic-layer.yml` — the real tables/dimensions/metrics you can query. Use these exact names.
- `parameters.yml` — project-wide parameters (if any).
- `prompt-history.md` — the prompts used to generate each version.
- `theme/` — styling instructions and assets.

## Read-only files

Most root config is reference only — editing it has **no effect** because the server rebuilds against its trusted template. This applies to `vite.config.js`, `tailwind.config.js`, `tsconfig.json`, and other build/tooling files.

`package.json` is **partially editable** only when custom dependencies are enabled for the Lightdash organization — see "Library boundaries" above; treat it as read-only otherwise. When enabled, you may add npm dependencies with `pnpm add <pkg>` — registry packages with plain semver versions only (no git/file/url specs), up to 60 direct dependencies, and `pnpm-lock.yaml` must be updated alongside (see the exception above — this is the one step that still requires pnpm and must succeed locally). On upload the CLI warns which packages will be installed in the build sandbox; install scripts never run. Other root config (vite/tailwind/tsconfig) remains read-only.
