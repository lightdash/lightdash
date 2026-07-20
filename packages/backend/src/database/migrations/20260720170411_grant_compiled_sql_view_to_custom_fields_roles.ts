import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const CUSTOM_FIELDS_SCOPE = 'manage:CustomFields';
const COMPILED_SQL_SCOPE = 'view:CompiledSql';

/**
 * `manage:CustomFields` used to gate both authoring custom SQL fields and
 * viewing the compiled SQL of charts that contain them. Viewing has been split
 * into the new `view:CompiledSql` scope. Copy the new scope into every custom
 * role that currently has `manage:CustomFields` so nobody loses access.
 *
 * Wrapped in try/catch because this is a backfill: failing it would block all
 * later migrations, and the worst case (some roles miss CompiledSql) is
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
                COMPILED_SQL_SCOPE,
                ScopedRolesTableName,
                CUSTOM_FIELDS_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260720170411] Failed to backfill ${COMPILED_SQL_SCOPE} for roles with ${CUSTOM_FIELDS_SCOPE}. Affected custom roles will need to grant ${COMPILED_SQL_SCOPE} manually.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', COMPILED_SQL_SCOPE)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260720170411] Failed to remove ${COMPILED_SQL_SCOPE} rows during rollback.`,
            error,
        );
    }
}
