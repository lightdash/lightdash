---
paths:
  - packages/backend/**
  - packages/common/src/types/api/uuid.ts
---

# Slugs — Project-Scoped Portable Identifiers

Slugs are unique per project and resource type for charts, dashboards, SQL Runner charts, spaces, and data apps. Database constraints are authoritative and include soft-deleted rows, so a deleted resource reserves its slug for a safe restore. The same slug may be used in a different project.

Use `generateUniqueSlugScopedToProject()` (`packages/backend/src/utils/SlugUtils.ts`) for normal creation. It derives the base with `generateSlug()`, probes exact indexed candidates, and appends `-1`, `-2`, and so on for conflicts. Explicit slugs used by content-as-code and promotion must be inserted exactly; same-project conflicts return an actionable conflict or resolve the intended active upsert, never overwrite another resource.

UUIDs remain the canonical internal identity. Use them for foreign keys, durable relationships, and references without an explicit project scope. Slugs are appropriate for project-scoped URLs and portable content-as-code selectors.

`getLtreePathFromSlug` is lossy: hyphens and underscores map to the same ltree label. Space hierarchy and access logic must use `parent_space_uuid`; path-based resolution must reject ambiguity rather than selecting an arbitrary row.

## Make uuid vs uuid-or-slug explicit (endpoints & service args)

A whole class of bug comes from a param named `*Uuid` that actually carries a
uuid *or* a slug (routes that accept either resolve via `getByIdOrSlug`), then
using the raw value as a real UUID downstream (DB write, FK, comparison). Make
the contract explicit instead of relying on the name:

- **Path params that accept either** must be typed `UuidOrSlug` and named
  `*UuidOrSlug` (e.g. `@Path() dashboardUuidOrSlug: UuidOrSlug`). This documents
  the dual contract in the OpenAPI spec.
- **Uuid-only path params** must be typed `UUID` (e.g. `@Path() versionUuid: UUID`).
  TSOA emits the uuid pattern validator for `UUID`, so non-uuid values are
  rejected at the request boundary (422). Both types live in
  `packages/common/src/types/api/uuid.ts`.
- **Service args** mirror the same names: a `UuidOrSlug` arg must be resolved to
  `entity.uuid` (via `getByIdOrSlug`) before being used as a key, FK, or in any
  comparison — never pass the raw arg downstream.
