import { Knex } from 'knex';

// CREATE INDEX CONCURRENTLY cannot run inside a transaction. Each statement
// runs in its own implicit transaction; the migration is idempotent so a
// partial run can be safely resumed by re-running.
export const config = { transaction: false };

const INDEXES: ReadonlyArray<{ table: string; index: string }> = [
    {
        table: 'analytics_chart_views',
        index: 'analytics_chart_views_user_uuid_timestamp_index',
    },
    {
        table: 'analytics_dashboard_views',
        index: 'analytics_dashboard_views_user_uuid_timestamp_index',
    },
];

export async function up(knex: Knex): Promise<void> {
    // Index builds on these tables can run for minutes; a configured
    // statement_timeout would abort the build and leave the migration lock held.
    await knex.raw(`SET statement_timeout = 0`);
    try {
        for (const { table, index } of INDEXES) {
            // A crashed CONCURRENTLY build leaves an INVALID index behind, and
            // IF NOT EXISTS matches by name only — drop it before rebuilding.
            // eslint-disable-next-line no-await-in-loop
            const invalid = await knex.raw<{ rowCount: number }>(
                `SELECT 1 FROM pg_class c
                 JOIN pg_index i ON i.indexrelid = c.oid
                 WHERE c.relname = ? AND NOT i.indisvalid`,
                [index],
            );
            if ((invalid.rowCount ?? 0) > 0) {
                // eslint-disable-next-line no-await-in-loop
                await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [index]);
            }
            // eslint-disable-next-line no-console
            console.log(`Building ${index} (concurrently)`);
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (user_uuid, "timestamp" DESC)`,
                [index, table],
            );
        }
    } finally {
        await knex.raw(`RESET statement_timeout`);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const { index } of INDEXES) {
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [index]);
    }
}
