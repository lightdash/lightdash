# Authorization scope migrations

How to safely split or migrate scopes without regressing existing users. Use
this doc when you need to ship a data migration that touches `scoped_roles`.

For the basics (how to add a new scope, which files to update, what the parity
test enforces), see the **Authorization & Custom Roles** section in the root
`CLAUDE.md`.

## Concepts glossary

| Term | Meaning |
|------|---------|
| **Subject** | A CASL subject name — the resource type a rule applies to (e.g. `Dashboard`, `CustomFields`). Defined in `types.ts::CaslSubjectNames`. |
| **Scope** | A named permission string like `manage:CustomFields`, the unit exposed to custom roles. One scope ⇒ one `can(action, Subject, conditions)` rule at build time. Defined in `scopes.ts`. |
| **System role** | Hard-coded role (viewer, interactive_viewer, editor, developer, admin) with a fixed ability set in `projectMemberAbility.ts` and `organizationMemberAbility.ts`. |
| **Custom role** | User-defined role stored in `roles` + `scoped_roles` with an arbitrary subset of scopes. Project-scoped by convention — do not set `organization_memberships.role_uuid`. |
| **Ability** | Compiled CASL object attached to a session. Built from either system-role functions or `buildAbilityFromScopes` for custom roles. |

## Ability resolution per request

A user's ability is assembled from two independent layers — org and project —
that are merged at the end. Each layer is resolved the same way:

- If the membership row has a non-null `role_uuid` (pointing to a custom role),
  that custom role's scopes drive the layer's rules via
  `buildAbilityFromScopes`.
- Otherwise, the membership's system role (the `role` column) drives the
  layer's rules via `organizationMemberAbility` / `projectMemberAbility`.

Then the two layers are concatenated — CASL rules are **additive**, so a
project custom role cannot revoke anything granted at the org layer. Only put
permissions at the org level if you never want project-level custom roles to
be able to withhold them.

A consequence worth internalizing: if a user has an org-level system role of
`editor` and a project-level custom role called "Developer without SQL runner",
then for project-scoped checks the custom role decides, but the user still
gets all the org-editor rules (which apply at the org scope). Neither layer
replaces the other; they stack.

## Splitting a scope via data migration

Pattern used when one scope has grown to cover multiple concerns and you need
to peel off a subset without revoking it from anyone who currently depends on
it. Example: `manage:CustomSql` used to cover both "save SQL charts" and
"create custom dimensions"; we split "custom dimensions" into a new
`manage:CustomFields` scope.

Worked example:
[PR #22082](https://github.com/lightdash/lightdash/pull/22082),
migration `20260417111420_grant_custom_fields_to_custom_sql_roles.ts`.

### Step by step

1. **Introduce the new scope**. Follow the 6-step checklist in the
   *Authorization & Custom Roles* section of the root `CLAUDE.md` (types.ts,
   scopes.ts, projectMemberAbility.ts, organizationMemberAbility.ts,
   roleToScopeMapping.ts, serviceAccountAbility.ts), plus add test fixtures.
   At this point the new scope exists but nothing checks it.
2. **Rewire call sites** that correspond to the peeled-off concern to check
   the new scope. Keep the old scope on sites that still represent the
   original concern.
3. **System-role parity**: grant the new scope to the same system roles that
   already had the old one. Preserves out-of-the-box behavior.
4. **Data migration**: every existing custom role that has the old scope must
   get the new scope too, otherwise users of those custom roles silently lose
   access. Easy to forget — this is the whole point of the migration.

### Migration template

```ts
import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const OLD_SCOPE = 'manage:CustomSql';
const NEW_SCOPE = 'manage:CustomFields';

export async function up(knex: Knex): Promise<void> {
    try {
        await knex.raw(
            `
            INSERT INTO ?? (role_uuid, scope_name, granted_by)
            SELECT role_uuid, ?, granted_by
            FROM ??
            WHERE scope_name = ?
            ON CONFLICT DO NOTHING
            `,
            [ScopedRolesTableName, NEW_SCOPE, ScopedRolesTableName, OLD_SCOPE],
        );
    } catch (error) {
        console.error(
            `[migration] Failed to backfill ${NEW_SCOPE} for roles with ${OLD_SCOPE}. Re-run the SQL manually if needed.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', NEW_SCOPE)
            .delete();
    } catch (error) {
        console.error('[migration] Failed to remove backfilled rows', error);
    }
}
```

Shape decisions:

- **Knex placeholders**: `??` interpolates an identifier (table/column name),
  `?` interpolates a value. The four placeholders in the `INSERT ... SELECT`
  resolve to two table names and two scope literals.
- **`ON CONFLICT DO NOTHING`**: `scoped_roles` has primary key
  `(role_uuid, scope_name)`, so if the new scope was already granted manually,
  the insert is a no-op.
- **Same `granted_by`**: preserves the original grantor for audit traceability.
- **Wrapped in try/catch**: this is a UX-continuity backfill, not a
  correctness-critical schema change. If it fails we don't want it blocking
  later migrations. Log the error so operators can rerun the SQL by hand.
  *Do not* wrap schema-altering migrations this way — those must fail loudly.
- **`down` is destructive**: it deletes every row with the new scope, not just
  the ones the migration added. If operators added the new scope to more
  roles between `up` and `down`, those grants disappear on rollback. Call this
  out in the migration body when relevant.

### Verifying locally

Set up a custom role with **only** the old scope (plus baseline view/edit
scopes) and assign it to a non-admin user. The normal path is the role editor
UI in Project settings → *Access & permissions* → *Roles*, which writes to
`roles` and `scoped_roles` for you. Direct SQL against those tables works too
if you need precise scope control while testing.

Then walk the feature you're peeling off through three states:

**Before migration** (after code changes, before `migrate`):
```sql
SELECT scope_name FROM scoped_roles WHERE role_uuid = '<test-role>';
-- expect: manage:CustomSql (+ baseline)
```
The user should **lose** access to the peeled-off feature. This proves the
code change moved the gate.

**After migration** (`pnpm -F backend migrate`):
```sql
-- expect: manage:CustomSql, manage:CustomFields (+ baseline)
```
The user regains access. Proves the migration restored continuity.

**After rollback** (`pnpm -F backend rollback-last`):
```sql
-- expect: manage:CustomSql (+ baseline)
```
New scope removed.

## Migration-specific pitfalls

- **Stale `@lightdash/common` in the backend**. The backend consumes the CJS
  build from `packages/common/dist/cjs/`. After adding a scope you must
  `pnpm -F common build` **and restart the backend process** — otherwise
  `parseScopes` drops the unknown scope name with a `console.warn("Invalid
  scope: ...")` and the rule is silently missing from every ability. The role
  editor API may also silently drop the scope on save.
- **Frontend session refresh**. Ability rules are hydrated from the backend
  on login; existing sessions don't pick up backend changes until they
  re-authenticate. Hard-refresh or log out/in when testing.
- **Org-level custom role assignments**. Don't set
  `organization_memberships.role_uuid` in seed data or tests. Custom roles are
  project-scoped by convention and org-level assignment produces confusing
  ability payloads.
- **Two membership rows decide the ability**: `project_memberships.role_uuid`
  wins for project-scoped checks; the org-level role still applies to
  org-scoped checks. When debugging "my user has the scope but can't do X",
  inspect both rows — and remember that if *either* has `role_uuid` set, the
  custom role is in play for that layer.
