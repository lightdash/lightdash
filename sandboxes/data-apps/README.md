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

| Component                         | Purpose                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `package.json` + `pnpm-lock.yaml` | Fixed dependency set. No `npm install` allowed — mirrors the E2B sandbox where install is disabled |
| `src/components/ui/`              | Pre-baked shadcn/ui primitives (Button, Card, Table, Dialog, etc.)                                 |
| `src/lib/utils.ts`                | `cn()` helper for Tailwind class merging                                                           |
| `src/main.jsx`                    | Bootstrap with React + QueryClientProvider                                                         |
| `vite.config.js`                  | Vite + React plugin + `@/` path alias + CDN base URL support                                       |
| `tailwind.config.js`              | Tailwind with shadcn theme tokens                                                                  |

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

## E2B template name and tag

The build script (`build-sandbox.ts`) and the backend (`AppGenerateService`) both target the
`lightdash-data-app` E2B template by default — this is the production template. Builds are
identified by `name:tag` ([E2B template tags](https://e2b.dev/docs/template/tags)); the
backend defaults its tag to the running Lightdash version.

Override either side independently:

| Env var                   | Used by                         | Default                                  |
| ------------------------- | ------------------------------- | ---------------------------------------- |
| `E2B_TEMPLATE_NAME`       | build script + backend          | `lightdash-data-app`                     |
| `E2B_TEMPLATE_TAG`        | build script + backend          | empty (build) / running `VERSION` (backend) |
| `E2B_TEMPLATE_EXTRA_TAGS` | build script (comma-separated)  | unset                                    |

```bash
# Build to a personal dev template, untagged (uses E2B's :default)
E2B_TEMPLATE_NAME=lukas-dev-template pnpm run build

# Build a versioned release-style image
E2B_TEMPLATE_NAME=lightdash-data-app \
E2B_TEMPLATE_TAG=0.2870.0 \
E2B_TEMPLATE_EXTRA_TAGS=latest \
  pnpm run build

# Backend resolves the same vars to compose `name:tag` for Sandbox.create
```

In CI, the release-driven jobs in `.github/workflows/post-release.yml` handle publishing
automatically — they tag each release as `lightdash-data-app:<version>` (and rolling
`:latest`), rebuilding the image only when this folder or `packages/query-sdk/` changed.

## Cloud Run gateway image

Use the Node version in `.nvmrc` and pnpm version in the root `package.json`.
Install repository dependencies with `sfw pnpm install --frozen-lockfile` from
its root (`npm install -g sfw` installs the dependency firewall if needed).
Docker with Buildx must be running.

From the repository root:

```bash
# Build for local inspection
./sandboxes/data-apps/build-cloud-run-image.sh lightdash-sandbox-gateway:local --load

# Build and push to your authenticated registry
./sandboxes/data-apps/build-cloud-run-image.sh \
  <registry>/<project>/lightdash-sandbox-gateway:<lightdash-version> --push
```

The script builds and packs the SDK from the checkout on every invocation,
includes the pinned ComputeSDK gateway, and cleans up its temporary build context.
Additional arguments are passed to `docker buildx build`. Use a checkout matching
both your deployed Lightdash version and the image tag. The script builds an
image only; follow the [Cloud Run sandbox deployment instructions](https://docs.lightdash.com/self-host/customize-deployment/sandboxes#google-cloud-run-sandboxes-self-hosted-preview)
to deploy and configure the service.

E2B and local Docker builds use the same `pack-query-sdk.sh` helper, so old SDK
archives are replaced when rebuilding after an upgrade.

Run `bash sandboxes/data-apps/test-build-cloud-run-image.sh` from the repository
root to check image assembly and failure handling without Docker or network access.

## Related

- **GLITCH-270** — E2B sandbox that runs this scaffold in production
- **GLITCH-274** — `@lightdash/query-sdk` for semantic layer API access
