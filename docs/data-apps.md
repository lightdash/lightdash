# Data Apps Architecture

This document describes how Data Apps work in Lightdash — AI-generated interactive React applications that can query
your project's metrics and dimensions, built from natural language prompts.

---

## Overview

Data Apps let users describe what they want in plain English and get a working, interactive React application back. Under
the hood, Claude Code runs inside an isolated sandbox, reads the project's dbt model catalog, generates a full React app,
builds it with Vite, and deploys the artifacts to S3. The resulting app is served in a sandboxed iframe and can query
Lightdash metrics through a secure postMessage bridge.

The feature is enterprise-only, gated behind the `APP_RUNTIME_ENABLED` flag and the `manage:DataApp` permission scope.

---

## How It Works (End-to-End)

```mermaid
flowchart LR
    A["1. Create app record\nstatus=building"] --> B["2. E2B Sandbox\n(create / resume)"]
    B --> C["3. Inject dbt catalog\nas YAML into sandbox"]
    C --> D["4. Claude Code\ngenerates React app"]
    D --> E["5. Vite build\nin sandbox"]
    E --> F["6. Upload dist\n+ source to S3"]
    F --> G["7. Serve in\nsandboxed iframe"]
```

### Step-by-step

1. **App creation** — The API creates a `DbApp` record and a v1 `DbAppVersion` with `status='building'`, then returns
   immediately with `{ appUuid, version }`. The pipeline runs asynchronously in the background.

2. **Sandbox setup** — An [E2B](https://e2b.dev/) sandbox is created from the `lightdash-data-app` template. The
   template contains a pre-configured React + Vite project with the Lightdash App SDK, plus a system prompt
   (`/app/skill.md`) that teaches Claude how to build data apps.

3. **Catalog injection** — The project's dbt catalog (tables, dimensions, metrics) is fetched via `CatalogModel` and
   written as YAML into the sandbox at `/tmp/dbt-repo/models/schema.yml`. This gives Claude full context on the
   available data model.

4. **Code generation** — Claude Code runs inside the sandbox with scoped file access
   (`Read`, `Write`, `Edit`, `Glob`, `Grep`) and generates the React app under `/app/src/`. Stream events are parsed in
   real time to provide status updates (e.g., "Creating Dashboard.tsx", "Editing App.tsx").

5. **Build** — `pnpm build` (Vite) compiles the generated code into production assets under `/app/dist`.

6. **Artifact storage** — Two tarballs are uploaded to S3:
   - `apps/{appUuid}/versions/{version}/dist.tar` — built assets (served to users)
   - `apps/{appUuid}/versions/{version}/source.tar` — source code (restored for future iterations)

7. **Preview serving** — The built app is served through an Express router at `/api/apps/{appUuid}/versions/{version}/`.
   Authentication uses short-lived JWT tokens. The iframe runs with `sandbox="allow-scripts"` (no same-origin access) and
   strict CSP headers.

### Iteration

When users send follow-up prompts, the system creates a new `DbAppVersion` and either:

- **Resumes** the paused E2B sandbox (preserving Claude's conversation history via `--continue`)
- **Creates** a new sandbox and restores the source from the latest ready version's S3 tarball

This means Claude can see what it built previously and make targeted changes rather than starting from scratch.

### Cancellation

Users can cancel a building version. This atomically marks it as `status='error'` in the database and pauses the sandbox
(interrupting any running commands). The sandbox remains resumable for subsequent iterations.

---

## Data Model

### Database Tables

| Table          | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `apps`         | App metadata: name, description, project, creator, sandbox ID         |
| `app_versions` | Version history: prompt, build status, error messages, status updates |

Key relationships:

- `apps.project_uuid` → `projects.project_uuid`
- `apps.space_uuid` → `spaces.space_uuid` (nullable, for future use)
- `app_versions.app_id` → `apps.app_id`

Version status transitions: `building` → `ready` | `error`

### Entity Types

Defined in `packages/backend/src/database/entities/apps.ts`:

```typescript
type DbApp = {
  app_id: string; // UUID primary key
  name: string;
  description: string;
  project_uuid: string;
  space_uuid: string | null;
  sandbox_id: string | null; // E2B sandbox ID for resume
  created_at: Date;
  created_by_user_uuid: string;
  deleted_at: Date | null; // soft delete
  deleted_by_user_uuid: string | null;
};

type DbAppVersion = {
  app_version_id: string; // UUID primary key
  app_id: string; // FK → apps
  version: number; // incrementing version number
  prompt: string; // user's request
  status: 'building' | 'ready' | 'error';
  error: string | null;
  status_message: string | null; // user-facing progress (e.g., "Creating Button.tsx")
  status_updated_at: Date | null;
  created_at: Date;
  created_by_user_uuid: string;
};
```

---

## API Endpoints

All endpoints require the `manage:DataApp` permission and are scoped under `/api/v1/ee/`.

### App CRUD

| Method  | Path                                                                      | Description                            |
| ------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `POST`  | `/projects/{projectUuid}/apps/`                                           | Create a new app from a prompt         |
| `GET`   | `/projects/{projectUuid}/apps/{appUuid}`                                  | Get app with paginated version history |
| `PATCH` | `/projects/{projectUuid}/apps/{appUuid}`                                  | Update name/description                |
| `POST`  | `/projects/{projectUuid}/apps/{appUuid}/versions`                         | Iterate with a follow-up prompt        |
| `POST`  | `/projects/{projectUuid}/apps/{appUuid}/versions/{version}/cancel`        | Cancel a building version              |
| `GET`   | `/projects/{projectUuid}/apps/{appUuid}/versions/{version}/preview-token` | Mint JWT for iframe preview            |
| `GET`   | `/user/apps`                                                              | List current user's apps (paginated)   |

### Preview Serving (token-based, not session-based)

| Method | Path                                                       | Description                                        |
| ------ | ---------------------------------------------------------- | -------------------------------------------------- |
| `GET`  | `/api/apps/{appUuid}/versions/{version}/`                  | Serve `index.html` with token-rewritten asset URLs |
| `GET`  | `/api/apps/{appUuid}/versions/{version}/assets/{filename}` | Serve static assets (JS, CSS, fonts, images)       |

Controller: `packages/backend/src/ee/controllers/appGenerateController.ts`
Preview router: `packages/backend/src/routers/appPreviewRouter.ts`

---

## Security Model

### Iframe Sandboxing

The preview iframe uses `sandbox="allow-scripts"` without `allow-same-origin`. This means:

- The iframe cannot access the parent page's cookies or storage
- The iframe cannot make credentialed requests to the Lightdash API directly
- All API communication goes through a `postMessage` bridge

### PostMessage Bridge (`useAppSdkBridge`)

Since the sandboxed iframe has no API access, the parent page acts as a proxy:

1. The iframe SDK sends `{ type: 'lightdash:sdk:fetch', method, path, body }` via `postMessage`
2. The parent validates the request against an allowlist of safe routes
3. If allowed, the parent executes the request with the user's session cookies
4. The parent posts the response back to the iframe

Allowed routes (defined in `packages/frontend/src/features/apps/hooks/useAppSdkBridge.ts`):

- `POST /api/v2/projects/{uuid}/query/metric-query` — run metric queries
- `GET /api/v2/projects/{uuid}/query/{queryId}` — poll for query results
- `GET /api/v1/user` — get current user info

All other routes are rejected.

### Preview Token Authentication

Preview requests use short-lived JWTs (signed with `LIGHTDASH_SECRET`), not session cookies:

- Tokens are minted per version and scoped to `{ appUuid, version }`
- The token is injected into asset URLs as `?token=` query parameters

### Content Security Policy

Each preview response includes a strict CSP header:

- `default-src 'none'` — deny everything by default
- `script-src 'self'` — only execute scripts from the app's own origin
- `connect-src 'self' {lightdashOrigin} https:` — allow API calls back to Lightdash
- `frame-ancestors {lightdashOrigin}` — only allow embedding from Lightdash

---

## Image Uploads

Users can attach images (screenshots, mockups, diagrams) to their prompts. These images are uploaded to S3 and passed
to Claude as context during code generation.

### Upload Flow

```mermaid
flowchart LR
    A["1. User attaches\nimage in chat UI"] --> B["2. POST raw bytes\nto backend"]
    B --> C["3. Backend streams\nto S3 (no buffering)"]
    C --> D["4. Return s3Key"]
    D --> E["5. Include s3Key in\ngenerate/iterate request"]
```

1. **User attaches image** — The chat UI lets users add an image file. A local preview is shown immediately.

2. **Upload to backend** — The frontend sends the raw file bytes directly to the backend via
   `POST /api/v1/ee/projects/{projectUuid}/apps/upload-image?appUuid={appUuid}` with the image's MIME type as the
   `Content-Type` header. This is a plain `fetch` call (not `lightdashApi`) because the body is raw binary, not JSON.

3. **Stream to S3** — The backend streams the request body directly to S3 via `PutObjectCommand` without buffering the
   entire file in memory. The image is stored at `apps/{appDir}/images/{uuid}.{ext}`.

4. **Return s3Key** — The backend returns `{ s3Key }` — the S3 object key where the image was stored.

5. **Attach to prompt** — When the user submits their prompt, the s3Key is included as an `AppImageAttachment` in the
   generate or iterate request body. The pipeline reads the image from S3 and provides it to Claude.

### Constraints

- **Allowed MIME types**: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- **Max size**: 10 MB (validated via `Content-Length` header before streaming)
- **Permission**: Requires `manage:DataApp` scope (same as all app operations)

---

## Frontend Architecture

### Pages

| Route                                                            | Component            | Purpose                                   |
| ---------------------------------------------------------------- | -------------------- | ----------------------------------------- |
| `/projects/:projectUuid/apps/generate`                           | `AppGenerate.tsx`    | New app creation (split-panel chat UI)    |
| `/projects/:projectUuid/apps/:appUuid`                           | `AppGenerate.tsx`    | Edit existing app (loads version history) |
| `/projects/:projectUuid/apps/:appUuid/versions/:version/preview` | `AppPreviewTest.tsx` | Standalone preview                        |
| `/projects/:projectUuid/apps/:appUuid/preview`                   | `AppPreviewTest.tsx` | Preview latest ready version              |

### Key Hooks

| Hook                   | File                                          | Purpose                              |
| ---------------------- | --------------------------------------------- | ------------------------------------ |
| `useGenerateApp`       | `features/apps/hooks/useGenerateApp.ts`       | POST to create a new app             |
| `useIterateApp`        | `features/apps/hooks/useIterateApp.ts`        | POST to create a new version         |
| `useGetApp`            | `features/apps/hooks/useGetApp.ts`            | Infinite query for version history   |
| `useAppBuildPoller`    | `features/apps/hooks/useAppBuildPoller.ts`    | Web Worker polling build status      |
| `useBuildNotification` | `features/apps/hooks/useBuildNotification.ts` | OS notification when build completes |
| `useAppSdkBridge`      | `features/apps/hooks/useAppSdkBridge.ts`      | postMessage fetch proxy              |
| `useAppPreviewToken`   | `features/apps/hooks/useAppPreviewToken.ts`   | Mint JWT for iframe preview          |
| `useCancelAppVersion`  | `features/apps/hooks/useCancelAppVersion.ts`  | Cancel a building version            |
| `useUpdateApp`         | `features/apps/hooks/useUpdateApp.ts`         | Update app name/description          |

### Build Status Polling

The frontend uses a Web Worker (`useAppBuildPoller`) to poll the GET app endpoint for status changes. When a version
transitions from `building` to `ready` or `error`, the poller triggers a query invalidation and optionally fires an OS
notification via `useBuildNotification`.

---

## Infrastructure Dependencies

| Service           | Purpose                                           | Config                                        |
| ----------------- | ------------------------------------------------- | --------------------------------------------- |
| **E2B**           | Serverless sandbox for code generation and builds | `E2B_API_KEY`                                 |
| **S3 / MinIO**    | Stores built artifacts and source tarballs        | `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET`, etc. |
| **Anthropic API** | Powers Claude Code inside the sandbox             | `ANTHROPIC_API_KEY`                           |

### Configuration (`AppRuntimeConfig`)

```
APP_RUNTIME_ENABLED=true                           # Master feature flag
E2B_API_KEY=...                                    # E2B sandbox API key
APP_RUNTIME_LIGHTDASH_ORIGIN=https://app.example   # Origin for CORS/CSP (defaults to SITE_URL)
APP_RUNTIME_CDN_ORIGIN=https://cdn.example.com     # Optional CDN for CSP
APP_RUNTIME_PREVIEW_ORIGIN=https://preview.example # Optional Separate domain for preview serving
```

S3 credentials are configured through the existing `S3_*` environment variables used by the app runtime config.

---

## Key Files

| File                                                                        | Purpose                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/backend/src/ee/services/AppGenerateService/AppGenerateService.ts` | Core pipeline: sandbox, Claude, build, S3, DB  |
| `packages/backend/src/ee/controllers/appGenerateController.ts`              | TSOA REST controllers                          |
| `packages/backend/src/models/AppModel.ts`                                   | Data access layer for apps and versions        |
| `packages/backend/src/routers/appPreviewRouter.ts`                          | Express router serving built artifacts from S3 |
| `packages/backend/src/routers/appPreviewToken.ts`                           | JWT minting and verification for preview auth  |
| `packages/backend/src/database/entities/apps.ts`                            | DB entity type definitions                     |
| `packages/common/src/ee/apps/types.ts`                                      | Shared API response types                      |
| `packages/frontend/src/pages/AppGenerate.tsx`                               | Split-panel chat UI for creation and iteration |
| `packages/frontend/src/features/apps/AppIframePreview.tsx`                  | Sandboxed iframe component                     |
| `packages/frontend/src/features/apps/hooks/useAppSdkBridge.ts`              | postMessage fetch proxy for iframe API access  |

---

## Permissions

Data apps use a single CASL scope: `manage:DataApp`, defined in `packages/common/src/authorization/scopes.ts`.

This scope gates all operations — creation, iteration, cancellation, viewing, and listing. It is checked at both the
controller level (via TSOA middleware) and the service level (via explicit `user.ability.cannot()` checks).

The scope is enterprise-only and must be granted to users through their role or custom role configuration.
