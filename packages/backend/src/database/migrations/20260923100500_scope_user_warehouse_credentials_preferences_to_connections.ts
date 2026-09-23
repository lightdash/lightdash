import type { Knex } from 'knex';

export const classification = {
    kind: 'breaking',
    reason: 'Replaces the (user_uuid, project_uuid) primary key with a connection-scoped primary key, so older binaries that upsert preferences on the two-column key fail until every pod runs the new release',
} as const;

export const config = { transaction: false };

const TABLE = 'project_user_warehouse_credentials_preference';
const CONNECTIONS_TABLE = 'warehouse_credentials';
const BATCH_SIZE = 10000;
const CONNECTION_INDEX =
    'project_user_wh_credentials_preference_connection_idx';
const CONNECTION_PRIMARY_KEY =
    'project_user_wh_credentials_preference_connection_pkey';
const CONNECTION_NOT_NULL_CHECK =
    'project_user_wh_credentials_preference_connection_not_null';
const LEGACY_PRIMARY_KEY = 'project_user_warehouse_credentials_preference_pkey';
const LEGACY_UNIQUE_INDEX =
    'project_user_wh_credentials_preference_user_project';
const CONNECTION_FOREIGN_KEY =
    'project_user_wh_credentials_preference_connection_fkey';

type ColumnState = 'missing' | 'nullable' | 'not_null';

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

const getConnectionColumnState = async (
    knex: Knex,
    connection: unknown,
): Promise<ColumnState> => {
    const result = await knex
        .raw<{ rows: { attnotnull: boolean }[] }>(
            `SELECT attnotnull
             FROM pg_attribute
             WHERE attrelid = ?::regclass
               AND attname = 'connection_uuid'
               AND NOT attisdropped`,
            [TABLE],
        )
        .connection(connection);
    const [column] = result.rows;
    if (!column) return 'missing';
    return column.attnotnull ? 'not_null' : 'nullable';
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

const scopePreferencesToOriginalConnection = async (
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
                            ORDER BY
                                credentials.created_at,
                                credentials.warehouse_credentials_uuid
                            LIMIT 1
                        ) AS connection_uuid
                    FROM ${TABLE} preference
                    JOIN projects
                        ON projects.project_uuid = preference.project_uuid
                    WHERE preference.connection_uuid IS NULL
                      AND EXISTS (
                          SELECT 1
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

const removeUnconnectedPreferences = async (
    knex: Knex,
    connection: unknown,
): Promise<void> => {
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                    SELECT preference.ctid
                    FROM ${TABLE} preference
                    WHERE preference.connection_uuid IS NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM ${CONNECTIONS_TABLE} credentials
                          JOIN projects
                              ON projects.project_id = credentials.project_id
                          WHERE projects.project_uuid = preference.project_uuid
                            AND credentials.superseded_at IS NULL
                      )
                    LIMIT ${BATCH_SIZE}
                )
                DELETE FROM ${TABLE} target
                USING batch
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

const withMigrationSession = async (
    knex: Knex,
    migrate: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await migrate(connection);
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
};

export async function up(knex: Knex): Promise<void> {
    await withMigrationSession(knex, async (connection) => {
        await knex
            .raw(
                `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL`,
            )
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

        if ((await getConnectionColumnState(knex, connection)) === 'nullable') {
            if (
                !(await constraintExists(
                    knex,
                    connection,
                    CONNECTION_NOT_NULL_CHECK,
                ))
            ) {
                await knex
                    .raw(
                        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (connection_uuid IS NOT NULL) NOT VALID`,
                        [TABLE, CONNECTION_NOT_NULL_CHECK],
                    )
                    .connection(connection);
            }

            console.log(`  ${TABLE}: scoping preferences to connections`);
            await scopePreferencesToOriginalConnection(knex, connection);
            console.log(
                `  ${TABLE}: removing preferences without a live connection`,
            );
            await removeUnconnectedPreferences(knex, connection);

            console.log(`  ${TABLE}: validating not-null constraint`);
            await knex
                .raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
                    TABLE,
                    CONNECTION_NOT_NULL_CHECK,
                ])
                .connection(connection);
            console.log(`  ${TABLE}: setting NOT NULL`);
            await knex
                .raw(
                    `ALTER TABLE ?? ALTER COLUMN connection_uuid SET NOT NULL`,
                    [TABLE],
                )
                .connection(connection);
        }
        await knex
            .raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
                TABLE,
                CONNECTION_NOT_NULL_CHECK,
            ])
            .connection(connection);

        console.log(`  ${TABLE}: building connection index (concurrently)`);
        await createConcurrentIndex(
            knex,
            connection,
            CONNECTION_INDEX,
            'connection_uuid',
        );

        if (
            !(await constraintExists(knex, connection, CONNECTION_PRIMARY_KEY))
        ) {
            console.log(
                `  ${TABLE}: building connection primary key index (concurrently)`,
            );
            await createConcurrentIndex(
                knex,
                connection,
                CONNECTION_PRIMARY_KEY,
                'user_uuid, project_uuid, connection_uuid',
                true,
            );
            console.log(`  ${TABLE}: promoting index to primary key`);
            await knex
                .raw(
                    `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??, ADD CONSTRAINT ?? PRIMARY KEY USING INDEX ??`,
                    [
                        TABLE,
                        LEGACY_PRIMARY_KEY,
                        CONNECTION_PRIMARY_KEY,
                        CONNECTION_PRIMARY_KEY,
                    ],
                )
                .connection(connection);
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    await withMigrationSession(knex, async (connection) => {
        if ((await getConnectionColumnState(knex, connection)) === 'missing') {
            return;
        }
        await removeDuplicateLegacyPreferences(knex, connection);

        if (!(await constraintExists(knex, connection, LEGACY_PRIMARY_KEY))) {
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
                        CONNECTION_PRIMARY_KEY,
                        LEGACY_PRIMARY_KEY,
                        LEGACY_UNIQUE_INDEX,
                    ],
                )
                .connection(connection);
        }
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [CONNECTION_INDEX])
            .connection(connection);
        await knex
            .raw(`ALTER TABLE ?? DROP COLUMN IF EXISTS connection_uuid`, [
                TABLE,
            ])
            .connection(connection);
    });
}
