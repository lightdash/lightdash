import type { Knex } from 'knex';

/**
 * Release ordering: this migration must ship in a release after the release that
 * carries 20260923100000 and SPK-2188. Older binaries upsert credentials on
 * project_id and break after its unique constraint is removed. Self-hosted
 * upgrades that skip that release must use the Recreate strategy.
 */

export const classification = {
    kind: 'breaking',
    reason: 'Removes project-level warehouse credential uniqueness after the UUID cutover, so older binaries cannot safely write credentials',
} as const;

export const config = { transaction: false };

const TABLE = 'warehouse_credentials';
const BATCH_SIZE = 10000;
const LOCK_TIMEOUT = '5s';
const PROJECT_UNIQUE_CONSTRAINT = 'warehouse_credentials_project_id_unique';
const PROJECT_INDEX = 'warehouse_credentials_project_id_idx';

const log = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(message);
};

const runDdl = async (
    knex: Knex,
    connection: Awaited<ReturnType<Knex['client']['acquireConnection']>>,
    message: string,
    sql: string,
): Promise<void> => {
    log(message);
    await knex
        .raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`)
        .connection(connection);
    try {
        await knex.raw(sql).connection(connection);
    } finally {
        await knex.raw('RESET lock_timeout').connection(connection);
    }
};

const constraintExists = async (
    knex: Knex,
    connection: Awaited<ReturnType<Knex['client']['acquireConnection']>>,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_constraint
             WHERE conrelid = '${TABLE}'::regclass
               AND conname = '${PROJECT_UNIQUE_CONSTRAINT}'
               AND contype = 'u'`,
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const dropInvalidIndex = async (
    knex: Knex,
    connection: Awaited<ReturnType<Knex['client']['acquireConnection']>>,
    indexName: string,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class
             JOIN pg_index ON pg_index.indexrelid = pg_class.oid
             WHERE pg_class.relname = '${indexName}'
               AND pg_index.indrelid = '${TABLE}'::regclass
               AND NOT pg_index.indisvalid`,
        )
        .connection(connection);
    if ((result.rowCount ?? 0) > 0) {
        await runDdl(
            knex,
            connection,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

const splitDormantCiphertext = async (
    knex: Knex,
    connection: Awaited<ReturnType<Knex['client']['acquireConnection']>>,
): Promise<void> => {
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS MATERIALIZED (
                    SELECT
                        live.warehouse_credentials_id,
                        live.project_id,
                        live.warehouse_type,
                        live.name,
                        live.encrypted_credentials,
                        live.list_all_databases,
                        live.additional_databases
                    FROM ${TABLE} live
                    WHERE live.superseded_at IS NULL
                      AND live.organization_warehouse_credentials_uuid IS NOT NULL
                      AND live.encrypted_credentials IS NOT NULL
                    ORDER BY live.warehouse_credentials_id
                    LIMIT ${BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED
                ),
                inserted AS (
                    INSERT INTO ${TABLE} (
                        project_id,
                        warehouse_type,
                        name,
                        encrypted_credentials,
                        organization_warehouse_credentials_uuid,
                        list_all_databases,
                        additional_databases,
                        superseded_at
                    )
                    SELECT
                        batch.project_id,
                        batch.warehouse_type,
                        batch.name,
                        batch.encrypted_credentials,
                        NULL,
                        batch.list_all_databases,
                        batch.additional_databases,
                        now()
                    FROM batch
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM ${TABLE} dormant
                        WHERE dormant.project_id = batch.project_id
                          AND dormant.superseded_at IS NOT NULL
                          AND dormant.organization_warehouse_credentials_uuid IS NULL
                          AND dormant.encrypted_credentials = batch.encrypted_credentials
                    )
                    RETURNING warehouse_credentials_id
                )
                UPDATE ${TABLE} live
                SET encrypted_credentials = NULL
                FROM batch
                WHERE live.warehouse_credentials_id = batch.warehouse_credentials_id`,
            )
            .connection(connection);
        const updated = result.rowCount ?? 0;
        if (updated === 0) return;
        total += updated;
        log(`Split dormant ciphertext from ${total} organization connections`);
    }
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await dropInvalidIndex(knex, connection, PROJECT_INDEX);
        await runDdl(
            knex,
            connection,
            `Creating ${PROJECT_INDEX}`,
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${PROJECT_INDEX} ON ${TABLE} (project_id)`,
        );

        if (await constraintExists(knex, connection)) {
            await runDdl(
                knex,
                connection,
                `Dropping ${PROJECT_UNIQUE_CONSTRAINT}`,
                `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${PROJECT_UNIQUE_CONSTRAINT}`,
            );
        } else {
            log(`${PROJECT_UNIQUE_CONSTRAINT} is already absent`);
        }

        await splitDormantCiphertext(knex, connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        const state = await knex
            .raw<{
                rows: {
                    has_multiple_live_connections: boolean;
                    has_superseded_connections: boolean;
                }[];
            }>(
                `SELECT
                    EXISTS (
                        SELECT 1
                        FROM ${TABLE}
                        WHERE superseded_at IS NULL
                          AND project_id IS NOT NULL
                        GROUP BY project_id
                        HAVING count(*) > 1
                    ) AS has_multiple_live_connections,
                    EXISTS (
                        SELECT 1
                        FROM ${TABLE}
                        WHERE superseded_at IS NOT NULL
                    ) AS has_superseded_connections`,
            )
            .connection(connection);
        const [currentState] = state.rows;
        if (currentState.has_multiple_live_connections) {
            throw new Error(
                'irreversible: projects with multiple live connections cannot be restored to one connection per project',
            );
        }
        if (currentState.has_superseded_connections) {
            throw new Error(
                'irreversible: superseded connection rows contain split dormant ciphertext and cannot be merged safely',
            );
        }

        if (!(await constraintExists(knex, connection))) {
            await dropInvalidIndex(knex, connection, PROJECT_UNIQUE_CONSTRAINT);
            await runDdl(
                knex,
                connection,
                `Creating ${PROJECT_UNIQUE_CONSTRAINT}`,
                `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${PROJECT_UNIQUE_CONSTRAINT} ON ${TABLE} (project_id)`,
            );
            await runDdl(
                knex,
                connection,
                `Adding ${PROJECT_UNIQUE_CONSTRAINT}`,
                `ALTER TABLE ${TABLE} ADD CONSTRAINT ${PROJECT_UNIQUE_CONSTRAINT} UNIQUE USING INDEX ${PROJECT_UNIQUE_CONSTRAINT}`,
            );
        } else {
            log(`${PROJECT_UNIQUE_CONSTRAINT} is already present`);
        }

        await runDdl(
            knex,
            connection,
            `Dropping ${PROJECT_INDEX}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${PROJECT_INDEX}`,
        );
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
