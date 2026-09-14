import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const MANAGE_ORGANIZATION_SCOPE = 'manage:Organization';
const COLOR_PALETTE_SCOPE = 'manage:OrganizationColorPalette';

/**
 * Colour palette management used to be gated by `update Organization`, which
 * custom roles obtained via the `manage:Organization` scope. That capability
 * has been split out into the new `manage:OrganizationColorPalette` scope.
 * Copy the new scope into every custom role that currently has
 * `manage:Organization` so nobody loses access.
 *
 * Wrapped in try/catch because this is a backfill: failing it would block all
 * later migrations, and the worst case (some roles miss the palette scope) is
 * recoverable by re-running the SQL manually.
 */
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
            [
                ScopedRolesTableName,
                COLOR_PALETTE_SCOPE,
                ScopedRolesTableName,
                MANAGE_ORGANIZATION_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260722153938] Failed to backfill ${COLOR_PALETTE_SCOPE} for roles with ${MANAGE_ORGANIZATION_SCOPE}. Affected custom roles will need to grant ${COLOR_PALETTE_SCOPE} manually.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', COLOR_PALETTE_SCOPE)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260722153938] Failed to remove ${COLOR_PALETTE_SCOPE} rows during rollback.`,
            error,
        );
    }
}
