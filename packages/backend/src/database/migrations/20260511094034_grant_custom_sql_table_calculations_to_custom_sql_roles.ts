import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const CUSTOM_SQL_SCOPE = 'manage:CustomSql';
const CUSTOM_SQL_TC_SCOPE = 'manage:CustomSqlTableCalculations';

/**
 * Backfill the new `manage:CustomSqlTableCalculations` scope into every custom
 * role that already has `manage:CustomSql`. Without this, custom roles that
 * unlocked SQL chart authoring would silently lose SQL table calculation
 * authoring once the gate flips on.
 *
 * Wrapped in try/catch because this is a backfill: failing it would block all
 * later migrations, and the worst case (some roles miss the new scope) is
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
                CUSTOM_SQL_TC_SCOPE,
                ScopedRolesTableName,
                CUSTOM_SQL_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260511094034] Failed to backfill ${CUSTOM_SQL_TC_SCOPE} for roles with ${CUSTOM_SQL_SCOPE}. Affected custom roles will need to grant ${CUSTOM_SQL_TC_SCOPE} manually.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', CUSTOM_SQL_TC_SCOPE)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260511094034] Failed to remove ${CUSTOM_SQL_TC_SCOPE} rows during rollback.`,
            error,
        );
    }
}
