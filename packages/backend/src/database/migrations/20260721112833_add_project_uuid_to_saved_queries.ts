import { Knex } from 'knex';

export const config = { transaction: false };

const SavedQueriesTableName = 'saved_queries';
const BatchSize = 1000;
const LockTimeout = '5s';

/**
 * Expand phase for direct saved-chart project ownership.
 *
 * Each bounded batch commits independently and reruns skip populated rows. A
 * hard-killed runner can still require its global Knex lock to be released
 * before another process resumes the remaining batches.
 */

type BackfillBatch = {
    batch_count: number;
    last_processed_id: number | null;
    updated_count: number;
};

async function addProjectUuidColumn(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        await trx.raw(`
            ALTER TABLE ${SavedQueriesTableName}
            ADD COLUMN IF NOT EXISTS project_uuid uuid
        `);
    });
}

async function getBackfillCutoff(knex: Knex): Promise<number> {
    const result = await knex.raw<{ rows: Array<{ cutoff: number }> }>(`
        SELECT COALESCE(MAX(saved_query_id), 0)::integer AS cutoff
        FROM ${SavedQueriesTableName}
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
                    saved_queries.saved_query_id,
                    CASE
                        WHEN direct_projects.project_uuid IS NOT NULL
                         AND dashboard_projects.project_uuid IS NOT NULL
                         AND direct_projects.project_uuid <> dashboard_projects.project_uuid
                            THEN NULL
                        ELSE COALESCE(
                            direct_projects.project_uuid,
                            dashboard_projects.project_uuid
                        )
                    END AS project_uuid
                FROM ${SavedQueriesTableName} AS saved_queries
                LEFT JOIN spaces AS direct_spaces
                    ON direct_spaces.space_id = saved_queries.space_id
                LEFT JOIN projects AS direct_projects
                    ON direct_projects.project_id = direct_spaces.project_id
                LEFT JOIN dashboards
                    ON dashboards.dashboard_uuid = saved_queries.dashboard_uuid
                LEFT JOIN spaces AS dashboard_spaces
                    ON dashboard_spaces.space_id = dashboards.space_id
                LEFT JOIN projects AS dashboard_projects
                    ON dashboard_projects.project_id = dashboard_spaces.project_id
                WHERE saved_queries.project_uuid IS NULL
                  AND saved_queries.saved_query_id > ?
                  AND saved_queries.saved_query_id <= ?
                ORDER BY saved_queries.saved_query_id
                LIMIT ${BatchSize}
            ), updated AS (
                UPDATE ${SavedQueriesTableName} AS saved_queries
                SET project_uuid = batch.project_uuid
                FROM batch
                WHERE saved_queries.saved_query_id = batch.saved_query_id
                  AND saved_queries.project_uuid IS NULL
                  AND batch.project_uuid IS NOT NULL
                RETURNING saved_queries.saved_query_id
            )
            SELECT
                COUNT(*)::integer AS batch_count,
                MAX(saved_query_id)::integer AS last_processed_id,
                (SELECT COUNT(*)::integer FROM updated) AS updated_count
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
    await knex.raw('SET statement_timeout = 0');
    try {
        await addProjectUuidColumn(knex);
        await backfillProjectUuids(knex);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        await trx.raw(`
            ALTER TABLE ${SavedQueriesTableName}
            DROP COLUMN IF EXISTS project_uuid
        `);
    });
}
