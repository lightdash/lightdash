import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable connection identity columns and indexes without changing existing row resolution',
} as const;

export const config = { transaction: false };

const LOCK_TIMEOUT = '5s';
const CONNECTION_TABLE = 'warehouse_credentials';
const additions = [
    {
        table: 'cached_explore',
        index: 'cached_explore_connection_uuid_idx',
        foreignKey: 'cached_explore_connection_uuid_fkey',
    },
    {
        table: 'saved_sql_versions',
        index: 'saved_sql_versions_connection_uuid_idx',
        foreignKey: 'saved_sql_versions_connection_uuid_fkey',
    },
    {
        table: 'query_history',
        index: 'query_history_connection_uuid_idx',
        foreignKey: null,
    },
] as const;

const runDdl = async (
    knex: Knex,
    connection: unknown,
    message: string,
    sql: string,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(message);
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
    connection: unknown,
    table: string,
    constraint: string,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
            [constraint, table],
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
        await runDdl(
            knex,
            connection,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        for (const addition of additions) {
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                connection,
                `Adding ${addition.table}.connection_uuid`,
                `ALTER TABLE ${addition.table} ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL`,
            );
            if (
                addition.foreignKey &&
                // eslint-disable-next-line no-await-in-loop
                !(await constraintExists(
                    knex,
                    connection,
                    addition.table,
                    addition.foreignKey,
                ))
            ) {
                // eslint-disable-next-line no-await-in-loop
                await runDdl(
                    knex,
                    connection,
                    `Adding ${addition.foreignKey}`,
                    `ALTER TABLE ${addition.table}
                     ADD CONSTRAINT ${addition.foreignKey}
                     FOREIGN KEY (connection_uuid)
                     REFERENCES ${CONNECTION_TABLE} (warehouse_credentials_uuid)
                     ON DELETE RESTRICT
                     NOT VALID`,
                );
            }
            if (addition.foreignKey) {
                // eslint-disable-next-line no-await-in-loop
                await runDdl(
                    knex,
                    connection,
                    `Validating ${addition.foreignKey}`,
                    `ALTER TABLE ${addition.table} VALIDATE CONSTRAINT ${addition.foreignKey}`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await dropInvalidIndex(knex, connection, addition.index);
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                connection,
                `Creating ${addition.index}`,
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${addition.index} ON ${addition.table} (connection_uuid)`,
            );
        }
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
        for (const addition of [...additions].reverse()) {
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                connection,
                `Dropping ${addition.index}`,
                `DROP INDEX CONCURRENTLY IF EXISTS ${addition.index}`,
            );
            if (addition.foreignKey) {
                // eslint-disable-next-line no-await-in-loop
                await runDdl(
                    knex,
                    connection,
                    `Dropping ${addition.foreignKey}`,
                    `ALTER TABLE ${addition.table} DROP CONSTRAINT IF EXISTS ${addition.foreignKey}`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                connection,
                `Dropping ${addition.table}.connection_uuid`,
                `ALTER TABLE ${addition.table} DROP COLUMN IF EXISTS connection_uuid`,
            );
        }
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
