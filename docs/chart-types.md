# Chart type registry architecture

How official chart types get from the public registry into a project: the
registry contract, listing, install, and the read-only/fork/upgrade model.
Vocabulary is defined in [`docs/chart-types/CONTEXT.md`](./chart-types/CONTEXT.md).
Project chart types themselves (viz schema, explorer behaviour, saved-chart
version pinning) are data apps — see the "Project chart types" section of
[`docs/data-apps.md`](./data-apps.md). The registry's own repo, publish
pipeline, and authoring runbook are documented in
[lightdash/lightdash-gallery](https://github.com/lightdash/lightdash-gallery).

---

## What it is

- The official registry (`lightdash/lightdash-gallery`, served from GitHub
  Pages) publishes prebuilt project chart types. A Lightdash deployment
  points at one registry URL; the in-product chart type gallery gains a
  **chart type library** section to browse them and install them per
  project.
- Installs use prebuilt artifacts — **no build ever runs on the customer
  instance**, so installing needs no sandbox and takes seconds.
- Installed official chart types are **read-only**; customizing one is an
  explicit, irreversible **fork** into a normal editable app.

## The registry contract

- A registry is fully static: a top-level `index.json` plus, per
  `<slug>/<version>`, a `dist.tar` (the same Vite production build the data
  apps pipeline produces), a `source.tar`, sha256 digests for both, and
  screenshots.
- The contract is shared code: `chartRegistryIndexSchema` and the semver
  helpers in `packages/common/src/ee/apps/registry.ts` validate the index
  both in the product (on fetch) and in the gallery repo's CI (on publish).
  Entries carry slug, name, description, semver version, tags, changelog,
  `minLightdashVersion`, the viz schema, screenshots, and artifact digests.
- Published versions are immutable in their entirety — artifacts,
  screenshots, and metadata. Changes ship as a new semver version; the
  publish pipeline digest-verifies already-published versions and hard-fails
  on drift rather than overwriting. Old versions stay served forever.
- Registry charts are template-deps-only: no dependencies beyond the data
  app template's own `package.json`, enforced by gallery CI.

## Listing in product

- `ChartRegistryClient` (backend) fetches and validates `index.json`.
  `GET /api/v1/ee/projects/{projectUuid}/apps/registry/charts` merges the
  index with the project's installed apps into per-chart state:
  `not_installed`, `installed`, `update_available`, or `incompatible`
  (instance older than `minLightdashVersion`).
- Screenshots and other registry assets reach the browser through the
  backend proxy at `/api/v1/ee/chart-registry` — the browser never talks to
  the registry directly.

## Install

- `POST /api/v1/ee/projects/{projectUuid}/apps/registry/charts/{chartSlug}/install`
  handles both first install and upgrade. The server downloads the
  artifacts, verifies their sha256 digests against the index, and imports
  the prebuilt dist through the data app import path via a server-internal
  `prebuiltDist` option. That option is never reachable from the HTTP
  upload endpoint — uploaded code always goes through the build sandbox;
  only registry installs skip it. Install is idempotent under concurrent
  requests.
- The result is a project-owned app with provenance: `apps.registry_slug`
  and `apps.registry_url` identify the upstream chart, and each installed
  version records `app_versions.registry_version` (the semver it came
  from). Once installed, the chart type behaves like any project chart type
  in the explorer.

## Read-only, fork, upgrade, uninstall

- Official chart types refuse iterate/edit/rename (thumbnail editing is
  deliberately still allowed). There is no computed "modified" state —
  read-only until forked is the model.
- **Fork** copies the current source into a new, fully-editable app.
  Lineage is recorded on `apps.origin_app_uuid`/`origin_app_version` —
  distinct from promotion's `upstream_app_uuid`. A fork never syncs with
  the registry again.
- **Upgrade** appends the newer registry version as a new app version on
  the same installed app. Which saved charts move is governed by
  saved-chart version pinning (see `docs/data-apps.md`): pinned charts keep
  the version they were saved with, unpinned charts follow latest.
- **Uninstall** is a standard app delete of the installed app, with the
  usual delete confirmation.

## Configuration and gating

- `LIGHTDASH_CHART_REGISTRY_URL` — the registry a deployment reads.
  Defaults to the official Pages URL; empty hides the library entirely.
- `LIGHTDASH_CHART_REGISTRY_ALLOW_INSECURE` — permits plain-http registries
  (local fixture servers, air-gapped mirrors). Logs a startup security
  warning; never set it against a registry you don't control.
- The feature sits on top of data apps (enterprise + its config/flags) and
  is additionally gated by the `chart-type-registry` feature flag.

## Where to look

- `packages/common/src/ee/apps/registry.ts` — the contract: index schema,
  semver helpers, API and state types.
- `packages/backend/src/ee/clients/ChartRegistryClient.ts` — fetching and
  validating the registry, transport guards.
- `packages/backend/src/ee/controllers/appGenerateController.ts` — the
  `/registry/charts` list and install routes.
- `packages/backend/src/ee/services/AppGenerateService/` — install,
  upgrade, and fork implementation.
- `packages/backend/src/ee/routers/chartRegistryAssetRouter.ts` — the
  registry asset proxy.
- `packages/frontend/src/features/chartTypes/` — the gallery, library
  section, and detail/fork/uninstall modals.
- `packages/backend/src/database/migrations/20260831121540_add_chart_registry_provenance.ts`
  — provenance and fork-lineage columns.
- [lightdash/lightdash-gallery](https://github.com/lightdash/lightdash-gallery)
  — the official registry: seed charts, publish pipeline, validation CI,
  and the authoring/publishing runbook.
