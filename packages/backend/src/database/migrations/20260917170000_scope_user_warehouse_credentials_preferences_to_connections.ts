import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable connection scope, backfills existing preferences in batches, and replaces uniqueness with a concurrent three-column index',
} as const;

export const config = { transaction: false };

const TABLE = 'project_user_warehouse_credentials_preference';
const CONNECTIONS_TABLE = 'warehouse_credentials';
const BATCH_SIZE = 10000;
const CONNECTION_INDEX =
    'project_user_wh_credentials_preference_connection_idx';
const CONNECTION_UNIQUE =
    'project_user_wh_credentials_preference_user_project_connection';
const LEGACY_PRIMARY_KEY = 'project_user_warehouse_credentials_preference_pkey';
const LEGACY_UNIQUE_INDEX =
    'project_user_wh_credentials_preference_user_project';
const CONNECTION_FOREIGN_KEY =
    'project_user_wh_credentials_preference_connection_fkey';

const constraintExists = async (
    knex: Knex,
    connection: unknown,
    constraintName: string,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
            [constraintName, TABLE],
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const dropInvalidIndex = async (
    knex: Knex,
    connection: unknown,
    indexName: string,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE c.relname = ? AND NOT i.indisvalid`,
            [indexName],
        )
        .connection(connection);
    if ((result.rowCount ?? 0) > 0) {
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [indexName])
            .connection(connection);
    }
};

const createConcurrentIndex = async (
    knex: Knex,
    connection: unknown,
    indexName: string,
    columns: string,
    unique = false,
): Promise<void> => {
    await dropInvalidIndex(knex, connection, indexName);
    await knex
        .raw(
            `CREATE ${unique ? 'UNIQUE ' : ''}INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (${columns})`,
            [indexName, TABLE],
        )
        .connection(connection);
};

const backfillConnections = async (
    knex: Knex,
    connection: unknown,
): Promise<void> => {
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                    SELECT
                        preference.ctid,
                        (
                            SELECT credentials.warehouse_credentials_uuid
                            FROM ${CONNECTIONS_TABLE} credentials
                            WHERE credentials.project_id = projects.project_id
                              AND credentials.superseded_at IS NULL
                            LIMIT 1
                        ) AS connection_uuid
                    FROM ${TABLE} preference
                    JOIN projects
                        ON projects.project_uuid = preference.project_uuid
                    WHERE preference.connection_uuid IS NULL
                      AND 1 = (
                          SELECT COUNT(*)
                          FROM ${CONNECTIONS_TABLE} credentials
                          WHERE credentials.project_id = projects.project_id
                            AND credentials.superseded_at IS NULL
                      )
                    LIMIT ${BATCH_SIZE}
                )
                UPDATE ${TABLE} target
                SET connection_uuid = batch.connection_uuid
                FROM batch
                WHERE target.ctid = batch.ctid`,
            )
            .connection(connection);
        if ((result.rowCount ?? 0) === 0) return;
    }
};

const removeDuplicateLegacyPreferences = async (
    knex: Knex,
    connection: unknown,
): Promise<void> => {
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH duplicates AS (
                    SELECT ctid
                    FROM (
                        SELECT
                            ctid,
                            ROW_NUMBER() OVER (
                                PARTITION BY user_uuid, project_uuid
                                ORDER BY connection_uuid NULLS LAST, ctid
                            ) AS row_number
                        FROM ${TABLE}
                    ) ranked
                    WHERE row_number > 1
                    LIMIT ${BATCH_SIZE}
                )
                DELETE FROM ${TABLE} target
                USING duplicates
                WHERE target.ctid = duplicates.ctid`,
            )
            .connection(connection);
        if ((result.rowCount ?? 0) === 0) return;
    }
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex.schema
            .alterTable(TABLE, (table) => {
                table.uuid('connection_uuid').nullable();
            })
            .connection(connection);

        if (
            !(await constraintExists(knex, connection, CONNECTION_FOREIGN_KEY))
        ) {
            await knex
                .raw(
                    `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (connection_uuid) REFERENCES ?? (warehouse_credentials_uuid) ON DELETE CASCADE NOT VALID`,
                    [TABLE, CONNECTION_FOREIGN_KEY, CONNECTIONS_TABLE],
                )
                .connection(connection);
        }
        await knex
            .raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
                TABLE,
                CONNECTION_FOREIGN_KEY,
            ])
            .connection(connection);

        await backfillConnections(knex, connection);
        await createConcurrentIndex(
            knex,
            connection,
            CONNECTION_INDEX,
            'connection_uuid',
        );
        await createConcurrentIndex(
            knex,
            connection,
            CONNECTION_UNIQUE,
            'user_uuid, project_uuid, connection_uuid',
            true,
        );

        if (!(await constraintExists(knex, connection, CONNECTION_UNIQUE))) {
            await knex
                .raw(
                    `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??, ADD CONSTRAINT ?? UNIQUE USING INDEX ??`,
                    [
                        TABLE,
                        LEGACY_PRIMARY_KEY,
                        CONNECTION_UNIQUE,
                        CONNECTION_UNIQUE,
                    ],
                )
                .connection(connection);
        }
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            try {
                await knex
                    .raw('RESET statement_timeout')
                    .connection(connection);
            } finally {
                await knex.client.releaseConnection(connection);
            }
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await removeDuplicateLegacyPreferences(knex, connection);
        await createConcurrentIndex(
            knex,
            connection,
            LEGACY_UNIQUE_INDEX,
            'user_uuid, project_uuid',
            true,
        );

        await knex
            .raw(
                `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??, ADD CONSTRAINT ?? PRIMARY KEY USING INDEX ??`,
                [
                    TABLE,
                    CONNECTION_UNIQUE,
                    LEGACY_PRIMARY_KEY,
                    LEGACY_UNIQUE_INDEX,
                ],
            )
            .connection(connection);
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [CONNECTION_INDEX])
            .connection(connection);
        await knex.schema
            .alterTable(TABLE, (table) => {
                table.dropColumn('connection_uuid');
            })
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            try {
                await knex
                    .raw('RESET statement_timeout')
                    .connection(connection);
            } finally {
                await knex.client.releaseConnection(connection);
            }
        }
    }
}
