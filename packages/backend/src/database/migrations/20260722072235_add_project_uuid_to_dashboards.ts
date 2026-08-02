import { Knex } from 'knex';

export const config = { transaction: false };

const DashboardsTableName = 'dashboards';
const BatchSize = 1000;
const LockTimeout = '5s';

type BackfillBatch = {
    batch_count: number;
    last_processed_id: number | null;
};

async function addProjectUuidColumn(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            ADD COLUMN IF NOT EXISTS project_uuid uuid
        `);
    });
}

async function getBackfillCutoff(knex: Knex): Promise<number> {
    const result = await knex.raw<{ rows: Array<{ cutoff: number }> }>(`
        SELECT COALESCE(MAX(dashboard_id), 0)::integer AS cutoff
        FROM ${DashboardsTableName}
    `);
    return result.rows[0]?.cutoff ?? 0;
}

async function backfillBatch(
    knex: Knex,
    lastProcessedId: number,
    cutoff: number,
): Promise<BackfillBatch | undefined> {
    return knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        const result = await trx.raw<{ rows: BackfillBatch[] }>(
            `WITH batch AS (
                SELECT
                    dashboards.dashboard_id,
                    projects.project_uuid
                FROM ${DashboardsTableName} AS dashboards
                LEFT JOIN spaces
                    ON spaces.space_id = dashboards.space_id
                LEFT JOIN projects
                    ON projects.project_id = spaces.project_id
                WHERE dashboards.project_uuid IS NULL
                  AND dashboards.dashboard_id > ?
                  AND dashboards.dashboard_id <= ?
                ORDER BY dashboards.dashboard_id
                LIMIT ${BatchSize}
            ), updated AS (
                UPDATE ${DashboardsTableName} AS dashboards
                SET project_uuid = batch.project_uuid
                FROM batch
                WHERE dashboards.dashboard_id = batch.dashboard_id
                  AND dashboards.project_uuid IS NULL
                  AND batch.project_uuid IS NOT NULL
            )
            SELECT
                COUNT(*)::integer AS batch_count,
                MAX(dashboard_id)::integer AS last_processed_id
            FROM batch`,
            [lastProcessedId, cutoff],
        );
        return result.rows[0];
    });
}

async function backfillProjectUuids(knex: Knex): Promise<void> {
    const cutoff = await getBackfillCutoff(knex);
    let lastProcessedId = 0;

    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await backfillBatch(knex, lastProcessedId, cutoff);
        if (!batch || batch.batch_count === 0) return;

        lastProcessedId = batch.last_processed_id ?? lastProcessedId;
    }
}

export async function up(knex: Knex): Promise<void> {
    await addProjectUuidColumn(knex);
    await backfillProjectUuids(knex);
}

export async function down(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            DROP COLUMN IF EXISTS project_uuid
        `);
    });
}
