# AGENTS.md

## LIGHTDASH_SECRET-Derived State Must Register for Rotation

Anything persisted or verified using `LIGHTDASH_SECRET` must be covered by the `rotate-lightdash-secret` maintenance command (`packages/backend/src/scripts/rotate-lightdash-secret/`), or secret rotation strands it. When adding:

-   **A new encrypted DB column** (`EncryptionUtil` ciphertext): add it to `CIPHERTEXT_REGISTRY` in `registry.ts` (table, primary key column, column) so the command re-encrypts it.
-   **A new deterministic token-hash table** (`hashWithSecret`): add it to `TOKEN_HASH_TABLES` in `rotation.ts` so hashes are classified and reported as removal blockers. Token hashes are one-way and can never be migrated by the command: lookup verifies against every configured secret, but a credential hashed under a fallback must be reissued or revoked before that fallback is removed.
-   **A new signed or secret-derived artifact** (JWT, HMAC, signed cookie): sign with `lightdashConfig.lightdashSecrets.active`, verify against `lightdashSecrets.all`, and document its lifetime in the removal gates of `docs/lightdash-secret-rotation.md` (short-lived artifacts break once their signing secret leaves the configured secrets; the runbook's waiting periods must cover them).

Tests in `rotation.test.ts` pin the registry contents — update them together with the registry.

## Slugs — Project-Scoped Portable Identifiers

Slugs are unique per project and resource type for charts, dashboards, SQL Runner charts, spaces, and data apps. Database constraints are authoritative and include soft-deleted rows, so a deleted resource reserves its slug for a safe restore. The same slug may be used in a different project.

Use `generateUniqueSlugScopedToProject()` (`packages/backend/src/utils/SlugUtils.ts`) for normal creation. It derives the base with `generateSlug()`, probes exact indexed candidates, and appends `-1`, `-2`, and so on for conflicts. Explicit slugs used by content-as-code and promotion must be inserted exactly; same-project conflicts return an actionable conflict or resolve the intended active upsert, never overwrite another resource.

Content-as-code upserts address content by exact slug, so a soft-deleted chart or dashboard that owns the slug is revived in place with the uploaded content instead of blocking the upload. Space paths are not database-constrained: one active space and any number of deleted spaces may share a path, and restoring a deleted space is rejected while an active space holds its path.

UUIDs remain the canonical internal identity. Use them for foreign keys, durable relationships, and references without an explicit project scope. Slugs are appropriate for project-scoped URLs and portable content-as-code selectors.

`getLtreePathFromSlug` is lossy: hyphens and underscores map to the same ltree label. Space hierarchy and access logic must use `parent_space_uuid`; path-based resolution must reject ambiguity rather than selecting an arbitrary row.

### Make uuid vs uuid-or-slug explicit (endpoints & service args)

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
