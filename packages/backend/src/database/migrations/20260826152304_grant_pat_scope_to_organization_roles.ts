import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Inserts one existing scope name onto organization-level custom roles with ON CONFLICT DO NOTHING; adds no schema and modifies no existing row',
} as const;

const RolesTableName = 'roles';
const ScopedRolesTableName = 'scoped_roles';
const PAT_SCOPE = 'manage:PersonalAccessToken';

/**
 * `manage:PersonalAccessToken` used to be a no-op in a custom role: the ability
 * builder granted token access from the deployment config regardless of the
 * role's scopes. An organization-level role in the primary slot is now
 * authoritative, so a role that omits the scope denies tokens. No existing role
 * can list it — organization roles are seeded from the static system-role
 * abilities, and token access was only ever added dynamically — so backfill it
 * everywhere to keep current access intact. Deployments that restrict tokens
 * through PAT_ALLOWED_ORG_ROLES or DISABLE_PAT still cap the scope at runtime.
 *
 * Project-level roles are untouched: the scope is organization-only, and their
 * users keep taking token access from their organization layer.
 *
 * Depends on the previous release, which made a listed scope respect the
 * deployment config. Older code treats a listed scope as an unconditional
 * grant, so writing these rows before that shipped everywhere would hand
 * tokens back to deployments that disabled them.
 *
 * Wrapped in try/catch because this is a backfill: failing it would block all
 * later migrations, and the worst case (some roles miss the scope) is
 * recoverable by re-running the SQL manually.
 */
export async function up(knex: Knex): Promise<void> {
    try {
        await knex.raw(
            `
            INSERT INTO ?? (role_uuid, scope_name, granted_by)
            SELECT role_uuid, ?, created_by
            FROM ??
            WHERE level = 'organization'
            ON CONFLICT DO NOTHING
            `,
            [ScopedRolesTableName, PAT_SCOPE, RolesTableName],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260826152304] Failed to backfill ${PAT_SCOPE} for organization-level custom roles. Users on those roles lose token access, and their existing personal access tokens stop authenticating, until the scope is granted manually.`,
            error,
        );
    }
}

/**
 * Removes the scope from organization-level roles again. A role that was
 * granted the scope deliberately after this migration ran is indistinguishable
 * from a backfilled one, so it loses it too.
 */
export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', PAT_SCOPE)
            .whereIn(
                'role_uuid',
                knex(RolesTableName)
                    .select('role_uuid')
                    .where('level', 'organization'),
            )
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260826152304] Failed to remove ${PAT_SCOPE} rows during rollback.`,
            error,
        );
    }
}
