# Data apps architecture

How data apps work in Lightdash: AI-generated interactive React applications built from a prompt on top of a
project's semantic layer. This is the architecture-level view — shapes, boundaries and invariants that rarely change.
Vocabulary is defined in [`docs/data-apps/CONTEXT.md`](./data-apps/CONTEXT.md); code is the reference for anything
finer-grained. User-facing behaviour is documented at
[docs.lightdash.com/data-apps](https://docs.lightdash.com/data-apps).

---

## What a data app is

- **Source code, not a block model.** A data app is a React project. Lightdash stores the source and the built
  assets per version; there is no intermediate content schema.
- **Every prompt appends a version.** Versions are append-only. Restore, duplicate, promotion and as-code upload all
  create versions too; nothing rewrites history.
- **Owned by a project**, living either in a space or as a **personal app** of its creator. Identified by a uuid
  internally and by a project-scoped slug in URLs and as-code files.
- **Runs in a sandboxed iframe with no API access.** Every query the app makes is proxied by the Lightdash page
  hosting it, so permissions, user attributes and row-level filters are enforced by Lightdash, never by the app.
- **Enterprise-only**, gated by a runtime config flag, a feature flag and the data app permission scopes.

## Actors

| Actor              | Role                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **User / builder** | Writes prompts, attaches context, previews, iterates, shares.                              |
| **Coding agent**   | The model inside the sandbox that writes and rebuilds the source (Claude Code or Codex).    |
| **AI agent**       | Lightdash's conversational agent (Ask AI). Finds, reads, and starts builds of data apps; the build itself runs through the same pipeline as the builder. |
| **External agent** | MCP clients read apps; the CLI edits source through data apps as code. Neither generates.  |

Only the coding agent writes a data app's source. The AI agent's `generateDataApp` tool creates a personal app
(creation experience `ai_agent`) and enqueues the build; the tool result starts pending and the worker patches it to
success (builder link) or error when the version reaches a terminal status, with a thread-read self-heal for anything
the worker missed.

---

## The build pipeline

Creating or iterating an app appends a version and enqueues a background job. The version moves through ordered
stages — pending, sandbox, catalog, generating, building, packaging, ready — with `error` as the only other terminal
state. Cancellation is an error carrying a "cancelled by user" marker, not a separate state. The frontend polls for
the transition out of the in-progress stages.

1. **Sandbox** — an isolated environment is created (or resumed) from a versioned starter image through a pluggable
   sandbox provider. The image ships a React + Vite project, the Lightdash App SDK and the coding agent's skill: a
   slim core plus reference files the agent reads on demand.
2. **Catalog** — the project's compiled explores (tables, dimensions, metrics, joins, parameters, AI hints) are
   written into the sandbox as YAML, alongside the prompt and any attached context.
3. **Generate** — the coding agent edits the project with scoped file access limited to the app source and the
   context directories. Its stream is parsed live into a status narration; output is redacted before it is stored.
4. **Build** — a production Vite build. Build failures trigger bounded auto-fix rounds by the agent.
5. **Package** — built assets are uploaded to object storage and served from there; the source is stored as a
   tarball for future iterations and for download as code. Static **data references** (explores, fields, filters,
   parameters, linked charts, external hosts) are extracted from the source and persisted with the version.
6. **Metadata** — on the first version the agent names and describes the app.

### Templates and clarifications

A new app starts from a **template** (Dashboard, Slide show, PDF report, From scratch) that seeds the agent's
instructions for the first version only; later prompts work from the existing source. Before the first build a
stateless, best-effort call may ask up to a few **clarifying questions**; answers travel with the version separately
from the verbatim prompt and are folded into the agent's instructions at build time. A clarifier outage never blocks
a build.

### Context

Everything the user attaches to a prompt is persisted with the version and surfaced to the agent as files plus a
one-line pointer per item in the prompt:

- **Charts** — the saved chart's metric query and visualization config. A chart is either **linked** (the app runs
  the saved chart live, so later edits flow through) or a **frozen copy** of its query.
- **Dashboards** — expanded into their charts plus a **blueprint** of the dashboard's structure (tabs, tiles,
  filters, parameters) so the agent can recreate its design.
- **Sample data** — opt-in per chart or dashboard: the first rows of the query, for content-level decisions. Sample
  rows live only inside the sandbox during the build and are never persisted.
- **Images, screenshots of the running preview, and files** — staged in object storage under an opaque id, written
  into the sandbox with a kind-aware name so the agent knows a design reference from a screenshot of its own work
  from reference material.
- **External connections** — linked APIs, with their shape and any saved samples.
- **Theme** — an organization-level bundle of CSS, fonts, images and instructions, copied into the sandbox; changing
  the theme is a style-only iteration.

The agent generates code, not data: it sees the catalog and the attached context, never a warehouse dump.

### Iteration

A follow-up prompt resumes the paused sandbox (keeping the agent's working state) or, if the sandbox is gone,
creates a fresh one and restores the latest ready source. The user can pick the coding agent's model per prompt;
reasoning effort follows the version (lower for first builds, higher for targeted edits).

---

## Versions

- **Ready versions** are the only ones that can be previewed, restored, duplicated or promoted.
- **Preview an older version** is read-only pinning in the builder; the public view always serves the latest ready
  version, and the prompt input is locked while pinned because iteration always branches from the head.
- **Restore** copies an earlier ready version's artifacts to a new head version, instantly and without a rebuild.
- **Duplicate** forks any app the caller can view into a new personal app at version 1, seeded from the latest ready
  version. History, images, pending clarifications and the sandbox are not carried over.
- **Promote** snapshots the latest ready version from a preview project into its upstream project: the first
  promotion creates a linked upstream app, later ones append versions to it. Spaces are mirrored by path; personal
  apps stay personal. Promoting a dashboard promotes the apps on its tiles and remaps the tiles. Creating a preview
  project duplicates every production app into it with the link already set, so iterating there and promoting
  updates the original.
- **Delete** follows the instance-wide soft-delete setting; soft-deleted apps keep their slug and can be restored by
  an admin. Hard delete removes rows, the sandbox and every stored artifact.

---

## Runtime

### Serving and isolation

Built assets are served from object storage behind a short-lived, version-scoped token embedded in the preview URL
path — not session cookies — so the iframe can be hosted cross-origin. The iframe runs without same-origin access and
with a strict CSP: scripts, styles and fetches only from the serving origin; images additionally from origins that
linked no-auth connections explicitly opt in. Because the sandbox origin is opaque, the serving origin is listed
alongside `'self'` on every directive. Frame ancestors are defense-in-depth only; the sandbox plus CSP are the real
boundary.

### The bridge

The hosting Lightdash page is the app's only route to data. The SDK inside the iframe posts requests over
`postMessage`; the host validates each against a small allowlist (run a metric query, run a saved chart live, poll
results, underlying data, scheduled exports, current user, external fetch through a linked connection) and executes
it with the viewer's own session. The same channel carries capability announces (an SDK feature manifest, screenshot
and lineage availability), URL state sync, the host colour scheme, cache invalidation and the screenshot round trip.
Unknown routes are rejected.

### What the host provides

- **Network inspector** — Queries and Requests tabs capturing everything the app talks to, held in memory unless
  persisted; Open in Explore and Save to Lightdash on inline queries; **Inspect data** highlights, via lineage
  metadata the agent emits at build time, which rendered elements came from which query.
- **Refresh** — reloads the iframe and re-runs queries without a build, invalidating the results cache for the rest
  of the session, in the builder, the standalone view and dashboard tiles alike.
- **Shareable URL state** — the app can publish bounded state that the host mirrors into the URL and, for scheduled
  deliveries, into the schedule, so a link or a delivery reopens the same view.
- **Host colour scheme** — the app follows the host's light/dark mode through a handshake; capture surfaces force
  light.
- **Thumbnails** — captured from the running app (or uploaded manually) for cards and previews.
- **Exports** — CSV/XLSX and PDF exports run through the normal Lightdash export pipeline; the app never serializes
  data itself.
- **Embedding and dashboards** — apps render as dashboard tiles (dashboard filters propagate to linked charts) and in
  embeds, where the JWT grants app viewing.

### Trust boundaries

| Boundary                     | Guarantee                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Sandbox → Lightdash          | The agent's egress is allowlisted to its model provider; it never holds Lightdash credentials.      |
| Iframe → Lightdash           | No API access; only allowlisted bridge routes, executed as the viewer.                             |
| Uploads                      | Clients hold opaque ids only; storage paths are derived server-side, so no direct object reference. |
| External connections         | Credentials are injected server-side by the proxy; the app and browser never see them.              |
| Screenshots / lineage        | Rasterised inside the iframe from its own DOM; the host never reads the app's DOM.                  |

---

## Data model

Entities, not columns:

- **App** — identity (uuid, project-scoped slug), name and description, space or personal, template, theme, sandbox
  handle, link to its upstream app when it lives in a preview project, soft-delete markers.
- **Version** — sequence number, verbatim prompt, status and status narration, error, attached context
  (clarifications, chart/dashboard/image/file/connection references, model and theme snapshot), viz schema for
  project chart types, declared dependencies, generation usage, data references.
- **Access grants** — per-app user and group access, in addition to space access.
- **Links** — external connections linked to an app; dashboard tiles that reference an app.

Artifacts (built assets, source tarballs, staged uploads, thumbnails) live in object storage under the app's prefix.

---

## Permissions

Checks live in the service layer against a subject that carries the app's space context and creator:

- **View** requires the project role that can run queries (plain viewers cannot open apps) plus space access, or
  ownership for personal apps. Embedded viewers get it from the JWT.
- **Create** is an editor-level project scope; creating directly inside a space additionally requires manage rights
  on that space. Developers can create and manage apps in their own preview projects.
- **Manage** (iterate, cancel, edit, move, pin, delete, thumbnails, upgrade, restore a version, promote, upload as
  code) is scoped to the app's space or to the owner's personal apps; project admins manage everything.
- **Duplicate is deliberately looser**: it needs only view on the source plus create on the project, because it
  never touches the source app.
- **Restore from soft delete and permanent delete** are admin-only and bypass the contextual check.
- **Custom dependencies** are a separate admin-level scope on top of an organization feature flag.

Once an app moves into a space, its creator has no special rights; access follows the space.

---

## External connections

A project admin registers a third-party HTTP API — base URL, allowed methods and path prefixes, auth, size and time
limits, optional instructions — and chooses whether builders may link it. Apps link a connection under an alias and
fetch through a Lightdash-mediated proxy that pins the host, enforces the method and path rules, injects credentials
server-side and audits byte counts, never bodies. Admins can test a connection through the exact proxy path and save
sanitised samples that are handed to the coding agent so generated code matches the API's real shape. Connections
are also a content-as-code resource; secrets never travel in files.

---

## Data apps as code

An app's source can be downloaded, edited locally, previewed against real data and uploaded as a new version with the
CLI. Identity travels by slug: uploading to a project where the slug exists appends a version, otherwise creates the
app. Only the source is sent; the server ignores local scaffolding and rebuilds in its own trusted sandbox, so the
trust model is unchanged. Downloads carry a point-in-time context snapshot (semantic layer, theme instructions) for
local reference. Local creation scaffolds the same starter template. Custom npm dependencies are an experimental,
flag-gated extension: registry-only, lockfile required, screened for malicious packages, install scripts never run.

---

## Project chart types

A project chart type is a data app built from a dedicated template that declares a viz schema instead of running
queries: the explorer hands it rows and a field mapping, and it renders. They share the pipeline, storage and
permissions of data apps but are excluded from app listings, have their own gallery and builder, and are downloaded
as code separately.

Official chart types can also be installed prebuilt from a chart registry, are read-only once installed, and are
customized by forking — the registry, library, install and fork model is documented in
[`docs/chart-types.md`](./chart-types.md).

A saved chart pins the version of the type it was saved with, so iterating on a type never changes existing charts.
Charts saved before pins exist follow the latest version until they are next edited and saved. When a newer version
exists, the explorer's configure panel offers an upgrade that lists the field, option and palette changes; upgrading
re-pins the chart being edited and reconciles its field mapping and option values against the new contract, and
nothing is persisted until the chart is saved.

---

## Infrastructure

| Concern            | Shape                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Sandbox            | Pluggable provider (E2B by default; Docker for local dev; cloud micro-VM options for self-hosting). |
| Coding agent       | Claude Code via the Anthropic API or Bedrock, or Codex; corporate gateways supported.               |
| Starter image      | Versioned with each release; iteration resumes on the version an app was built with.                |
| Object storage     | S3-compatible bucket for artifacts, uploads and thumbnails, optionally separate from the main one.  |
| Jobs               | The scheduler worker runs the pipeline; the API only enqueues.                                     |

Configuration is documented for operators in the self-host docs; the parsed config in the backend is the source of
truth for names and defaults.

---

## Where to look

- `packages/common/src/ee/apps/` — shared types, version stages, data references, SDK bridge routes and features.
- `packages/backend/src/ee/services/AppGenerateService/` — the pipeline, authorization, coding agent environments.
- `packages/backend/src/routers/appPreviewRouter.ts` — serving, tokens, CSP.
- `packages/frontend/src/features/apps/` — builder, preview, bridge, inspector.
- `packages/query-sdk/` — the SDK shipped inside apps.
- `sandboxes/data-apps/` — the starter template, skill and references, benchmark harness.
- `packages/cli/src/handlers/apps/` — data apps as code.
