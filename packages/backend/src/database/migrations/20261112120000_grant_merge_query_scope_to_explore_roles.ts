import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Inserts scope rows for existing custom roles; no schema change',
} as const;

const ScopedRolesTableName = 'scoped_roles';
const EXPLORE_SCOPE = 'manage:Explore';
const MERGE_QUERY_SCOPE = 'manage:MergeQuery';

// Merging used to ride on manage:Explore; keep it for roles that had it.
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
                MERGE_QUERY_SCOPE,
                ScopedRolesTableName,
                EXPLORE_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20261112120000] Failed to backfill ${MERGE_QUERY_SCOPE} for roles with ${EXPLORE_SCOPE}. Affected custom roles will need to grant ${MERGE_QUERY_SCOPE} manually.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', MERGE_QUERY_SCOPE)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20261112120000] Failed to remove ${MERGE_QUERY_SCOPE} rows during rollback.`,
            error,
        );
    }
}
