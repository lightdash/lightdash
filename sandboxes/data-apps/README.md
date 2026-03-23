# Data Apps Scaffold

This directory is the project template that Claude Code generates into when building a data app. It's also the base image for the E2B sandbox in production.

## How it works

```
skill.md + user prompt → Claude Code → writes into src/ → vite build → dist/
```

**Inputs:**
- `skill.md` — system prompt appended to Claude Code. Describes approved packages, pre-baked components, lockdown rules, and the semantic layer context (models, metrics, dimensions) for the connected Lightdash project
- A user prompt like _"Build me a revenue dashboard by customer segment"_

**Outputs:**
- `dist/index.html` — entry point to serve
- `dist/assets/` — hashed JS/CSS bundles

In production, these get uploaded to GCS/S3 and served via CDN. The `VITE_ASSET_BASE_URL` env var bakes fully qualified CDN URLs into the build output at build time.

## What's in the template

Everything outside `src/` is locked — Claude Code only writes inside `src/`.

| Component | Purpose |
|-----------|---------|
| `package.json` + `pnpm-lock.yaml` | Fixed dependency set. No `npm install` allowed — mirrors the E2B sandbox where install is disabled |
| `src/components/ui/` | Pre-baked shadcn/ui primitives (Button, Card, Table, Dialog, etc.) |
| `src/lib/utils.ts` | `cn()` helper for Tailwind class merging |
| `src/main.jsx` | Bootstrap with React + QueryClientProvider |
| `vite.config.js` | Vite + React plugin + `@/` path alias + CDN base URL support |
| `tailwind.config.js` | Tailwind with shadcn theme tokens |

## What Claude Code changes

- `src/App.jsx` — the main app component (replaced entirely)
- `src/components/*.tsx` — custom components for the specific app
- `src/hooks/*.ts` — data fetching hooks using `@tanstack/react-query`

It does **not** touch config files, `package.json`, `node_modules`, or `src/components/ui/`.

## Local usage

```bash
# One-time setup
./scripts/bootstrap.sh

# Generate an app
./scripts/generate.sh "Build me a revenue dashboard by customer segment"

# Dev server
pnpm run dev

# Production build
pnpm run build
```

## Related

- **GLITCH-270** — E2B sandbox that runs this scaffold in production
- **GLITCH-274** — `@lightdash/sdk` for semantic layer API access
