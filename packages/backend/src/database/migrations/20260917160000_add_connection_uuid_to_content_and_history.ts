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
    message: string,
    sql: string,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(message);
    await knex.raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
    try {
        await knex.raw(sql);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
};

const constraintExists = async (
    knex: Knex,
    table: string,
    constraint: string,
): Promise<boolean> => {
    const result = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
        [constraint, table],
    );
    return (result.rowCount ?? 0) > 0;
};

const dropInvalidIndex = async (
    knex: Knex,
    indexName: string,
): Promise<void> => {
    const result = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
         WHERE c.relname = ? AND NOT i.indisvalid`,
        [indexName],
    );
    if ((result.rowCount ?? 0) > 0) {
        await runDdl(
            knex,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        for (const addition of additions) {
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                `Adding ${addition.table}.connection_uuid`,
                `ALTER TABLE ${addition.table} ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL`,
            );
            if (
                addition.foreignKey &&
                // eslint-disable-next-line no-await-in-loop
                !(await constraintExists(
                    knex,
                    addition.table,
                    addition.foreignKey,
                ))
            ) {
                // eslint-disable-next-line no-await-in-loop
                await runDdl(
                    knex,
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
                    `Validating ${addition.foreignKey}`,
                    `ALTER TABLE ${addition.table} VALIDATE CONSTRAINT ${addition.foreignKey}`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await dropInvalidIndex(knex, addition.index);
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                `Creating ${addition.index}`,
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${addition.index} ON ${addition.table} (connection_uuid)`,
            );
        }
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        for (const addition of [...additions].reverse()) {
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                `Dropping ${addition.index}`,
                `DROP INDEX CONCURRENTLY IF EXISTS ${addition.index}`,
            );
            if (addition.foreignKey) {
                // eslint-disable-next-line no-await-in-loop
                await runDdl(
                    knex,
                    `Dropping ${addition.foreignKey}`,
                    `ALTER TABLE ${addition.table} DROP CONSTRAINT IF EXISTS ${addition.foreignKey}`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                `Dropping ${addition.table}.connection_uuid`,
                `ALTER TABLE ${addition.table} DROP COLUMN IF EXISTS connection_uuid`,
            );
        }
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}
