# OrganizationDesignService

<summary>
Service for managing organization-shared design assets (CSS, fonts, images, instruction markdown) used by the data-apps pipeline. Owns metadata via `OrganizationDesignModel` (Postgres) and bytes via S3 under a `designs/` prefix in the app-runtime bucket.
</summary>

<howToUse>
Access via `ServiceRepository.getOrganizationDesignService()`. Service methods all take an `Account` and enforce CASL permissions internally (`view:OrganizationDesign` for reads, `manage:OrganizationDesign` for writes). The `designS3Key` helper is exported separately for the Stage 3 pipeline copy.

```typescript
const designService = serviceRepository.getOrganizationDesignService();

// CRUD
const designs = await designService.listDesigns(account);
const design = await designService.getDesign(account, designUuid);
await designService.createDesign(account, { name, description });
await designService.updateDesign(account, designUuid, { name });
await designService.deleteDesign(account, designUuid); // cascades S3 prefix
await designService.setAsDefault(account, designUuid);

// Files
await designService.uploadFile(account, designUuid, {
    kind,           // 'css' | 'font' | 'image' | 'instruction'
    filename,       // original name; backend sets Content-Disposition from this
    contentType,    // stored but not trusted; extension is authoritative
    body,           // Readable stream — streaming cap fires at 10 MB
    contentLength,  // pre-checked against the cap before reading bytes
});
await designService.deleteFile(account, designUuid, fileUuid);
const stream = await designService.getFileStream(account, designUuid, fileUuid);
```

</howToUse>

## S3 Key Layout

Files live in the **app-runtime bucket** (`APPS_S3_BUCKET`, default `lightdash-apps`) under a deterministic prefix:

```
designs/{orgUuid}/{designUuid}/{fileUuid}/{filename}
```

Example:

```
designs/172a2270-…ae51/5a7bb06f-…1da9/44a441c0-…aa2b/logo.png
```

Every UUID in the path does specific work — do not flatten this without understanding the trade-offs:

| Level | Purpose | What breaks without it |
|---|---|---|
| `{orgUuid}` | Multi-tenant partition (one bucket, many orgs) | Cross-org S3 cascade-delete could touch other orgs' files |
| `{designUuid}` | An org can have N designs ("Marketing brand", "Engineering brand"…) | Files from different designs collide; `setAsDefault` semantics break |
| `{fileUuid}` | Two files within the same design can share a filename (re-upload `logo.png` to replace; same `theme.css` in two designs) — `fileUuid` is the stable handle the DB row stores | Either silent overwrites on filename collision, or extra service-side dedupe / rename logic |
| `{filename}` | Preserves original name for `Content-Disposition` on download, and gives the Stage 3 sandbox copy a meaningful filename the agent can read | Files would have UUID names in the agent sandbox with no semantic context |

Cascade behavior:
- `deleteDesign` removes the metadata row first, then issues a paginated `ListObjectsV2` + `DeleteObjects` sweep over the `designs/{orgUuid}/{designUuid}/` prefix (see `deleteDesignS3Prefix`).
- `deleteFile` deletes the single object at `designs/{orgUuid}/{designUuid}/{fileUuid}/{filename}`.
- Postgres `ON DELETE CASCADE` on the `design_uuid` FK handles row-side cascade if the parent design row is removed.

## Other Intentional Behaviors

These came out of the Stage 1 hardening pass and are non-obvious from reading the code alone:

### Upload pattern: raw body + query params, not multipart

Mirrors `appGenerateController.uploadImage`. The TSOA controller decodes `kind` and `filename` from query params and reads the request body as a stream. The original plan called for `multipart/form-data`, but the codebase convention is raw body — see Stage 1 deviation notes in `~/.claude/plans/synthetic-booping-oasis.md`.

### Streaming-cap during upload

`uploadFile` does **not** buffer the whole body before checking size. It uses a `for await` over the request stream with a running total; once `total > MAX_FILE_BYTES` (10 MB) it throws `ParameterError` mid-read. Mirrors `AppGenerateService.bufferAndValidate`. The controller also rejects `Content-Length > MAX_FILE_BYTES` upfront so a lying client doesn't get to send a single byte.

The buffered final body is what hits S3 — streaming bodies break AWS SDK v4 signing on MinIO/GCS (RequestTimeout). The cap discipline is purely defensive against unbounded reads.

### Filename extension is authoritative — not Content-Type

Browsers send wildly varying MIME strings for the same font/image formats. `ensureFilenameMatchesKind` validates against a per-`kind` extension allowlist (e.g. `font` accepts `.woff/.woff2/.ttf/.otf`). The `contentType` field is stored on the row but not used for routing or kind validation.

### Magic-byte validation before write

Every upload runs `ensureContentMatchesExtension` after the body is buffered:
- **Binary kinds** (`.png/.jpg/.jpeg/.gif/.webp/.woff/.woff2/.ttf/.otf`) — signature bytes must match at known offsets. WEBP requires both RIFF + WEBP markers.
- **Text kinds** (`.css/.md/.svg`) — `TextDecoder('utf-8', { fatal: true })` rejects invalid UTF-8; first 1KB must contain no null bytes.
- **`.svg` specifically** — must start with `<?xml`, `<svg`, `<!--`, or `<!DOCTYPE`.

### SVG sanitize-on-write via DOMPurify

SVGs run through DOMPurify with `USE_PROFILES: { svg: true, svgFilters: true }` before the bytes hit S3. Strips `<script>`, `on*=` handlers, `<foreignObject>`, and `javascript:` hrefs. **The sanitized buffer is what's stored**, so downstream consumers can't accidentally serve the unsanitized original.

This is not a full XSS defense — for a hypothetical future cross-origin consumer (embed branding, login-page logo, etc.) a render-time sanitize would still be appropriate as defense in depth.

### S3 client mirrors AppGenerateService

`getS3Client()` reads from `lightdashConfig.appRuntime.s3` (not the general S3 config) so designs share the same bucket and credentials as data-app sources. Throws `MissingConfigError` if `APPS_RUNTIME_ENABLED` is off or the bucket isn't configured.

<importantToKnow>
- **Bucket bootstrap is a known gap** — `APPS_S3_BUCKET` (default `lightdash-apps`) is not auto-provisioned in the dev MinIO setup. If you blow away your MinIO volume, create the bucket manually: `docker exec lightdash-app-minio-1 sh -c 'mc alias set l http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1; mc mb l/lightdash-apps'`. Tracked as a follow-up.
- **NoSuchBucket returns 500, not 400** — if the bucket is missing the AWS SDK error bubbles up as `UnexpectedServerError`. Worth translating to a clearer 4xx with a hint. Tracked as a follow-up.
- **CSS sanitization is not implemented.** CSS files are stored as-uploaded. The vectors (`@import url(http://evil)`, `url('javascript:...')`) are mostly mitigated by browser behavior but would need a CSS-AST sanitizer if these files are ever served cross-origin. Out of scope for Stage 1.
- **Instruction-MD goes into the LLM system prompt**, not the DOM. The threat is prompt injection ("ignore prior instructions"), not HTML XSS. DOMPurify doesn't help here; a separate prompt-hygiene pass would.
- **Tests** — Model has 18 unit tests in `packages/backend/src/models/OrganizationDesignModel.test.ts`. Service is currently smoke-tested via the controller's E2E path (curl + UI). No service-level unit test yet; would benefit from one covering the magic-byte + sanitize-SVG paths.
</importantToKnow>

<links>
- @/packages/backend/src/services/OrganizationDesignService/OrganizationDesignService.ts - Service implementation
- @/packages/backend/src/models/OrganizationDesignModel.ts - Data access
- @/packages/backend/src/controllers/organizationDesignController.ts - TSOA controller
- @/packages/common/src/ee/designs/types.ts - API types
- @/packages/backend/src/ee/services/AppGenerateService/AppGenerateService.ts - The precedent for the upload + magic-byte patterns; Stage 3 also uses `designS3Key` from here
</links>
