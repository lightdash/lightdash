import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const LEGACY_DASHBOARD_EXPORT_SCOPES = [
    'export:DashboardCsv',
    'export:DashboardImage',
    'export:DashboardPdf',
];

/**
 * Strip three legacy scope names from `scoped_roles`. They were removed
 * from the scope vocabulary in #22802 (they were never enforced at any
 * endpoint — `manage:ExportCsv` is the real gate). Custom roles created
 * before that PR still carry the legacy strings, and every request that
 * loads such a role re-emits an `Invalid scope: ...` warning from
 * `parseScopes`, dominating Cloud Logging volume.
 *
 * Wrapped in try/catch because this is best-effort cleanup: failing it
 * would block later migrations, and the worst case (some legacy rows
 * stick around) is recoverable by re-running the DELETE manually.
 */
export async function up(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .whereIn('scope_name', LEGACY_DASHBOARD_EXPORT_SCOPES)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260519142606] Failed to remove legacy dashboard export scopes from ${ScopedRolesTableName}. Affected rows can be cleaned up manually with: DELETE FROM ${ScopedRolesTableName} WHERE scope_name IN (${LEGACY_DASHBOARD_EXPORT_SCOPES.map(
                (s) => `'${s}'`,
            ).join(', ')});`,
            error,
        );
    }
}

export async function down(_knex: Knex): Promise<void> {
    // No-op. The legacy scopes are no longer in the scope vocabulary, so
    // there is nothing to restore them to — `parseScopes` would filter
    // them out on the next load anyway. Rolling back the migration on
    // the schema side is enough.
}
