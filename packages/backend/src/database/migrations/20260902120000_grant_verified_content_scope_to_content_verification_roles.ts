import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Inserts scope rows for existing custom roles; no schema change',
} as const;

const ScopedRolesTableName = 'scoped_roles';
const CONTENT_VERIFICATION_SCOPE = 'manage:ContentVerification';
const VERIFIED_CONTENT_SCOPE = 'manage:VerifiedContent';

/**
 * `manage:VerifiedContent` (edit lock for verified charts/dashboards) was added
 * after custom roles already existed, so roles that can verify content via
 * `manage:ContentVerification` were locked out of editing it. Copy the new scope
 * into every custom role that has `manage:ContentVerification`.
 *
 * Wrapped in try/catch because this is a backfill: failing it would block all
 * later migrations, and the worst case is recoverable by re-running the SQL.
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
                VERIFIED_CONTENT_SCOPE,
                ScopedRolesTableName,
                CONTENT_VERIFICATION_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260902120000] Failed to backfill ${VERIFIED_CONTENT_SCOPE} for roles with ${CONTENT_VERIFICATION_SCOPE}. Affected custom roles will need to grant ${VERIFIED_CONTENT_SCOPE} manually.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(ScopedRolesTableName)
            .where('scope_name', VERIFIED_CONTENT_SCOPE)
            .whereIn(
                'role_uuid',
                knex(ScopedRolesTableName)
                    .select('role_uuid')
                    .where('scope_name', CONTENT_VERIFICATION_SCOPE),
            )
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260902120000] Failed to remove ${VERIFIED_CONTENT_SCOPE} rows during rollback.`,
            error,
        );
    }
}
