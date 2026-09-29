import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds non-unique indexes built concurrently for user attribute lookups; no schema or data changes, so older binaries are unaffected',
} as const;

export const config = { transaction: false };

type LookupIndex = {
    name: string;
    table: string;
    column: string;
};

const INDEXES: LookupIndex[] = [
    {
        name: 'user_attributes_organization_id_idx',
        table: 'user_attributes',
        column: 'organization_id',
    },
    {
        name: 'group_user_attributes_user_attribute_uuid_idx',
        table: 'group_user_attributes',
        column: 'user_attribute_uuid',
    },
    {
        name: 'group_memberships_user_id_idx',
        table: 'group_memberships',
        column: 'user_id',
    },
];

const run = async (
    knex: Knex,
    connection: unknown,
    message: string,
    sql: string,
): Promise<void> => {
    console.log(message);
    await knex.raw(sql).connection(connection);
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
        await run(
            knex,
            connection,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

const inSequence = <T>(items: T[], step: (item: T) => Promise<void>) =>
    items.reduce<Promise<void>>(
        (previous, item) => previous.then(() => step(item)),
        Promise.resolve(),
    );

const withSession = async (
    knex: Knex,
    migrate: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw('SET lock_timeout = 0').connection(connection);
        await migrate(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, (connection) =>
        inSequence(INDEXES, async (index) => {
            await dropInvalidIndex(knex, connection, index.name);
            await run(
                knex,
                connection,
                `Creating ${index.name} (concurrently)`,
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ON ${index.table} (${index.column})`,
            );
        }),
    );
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, (connection) =>
        inSequence([...INDEXES].reverse(), (index) =>
            run(
                knex,
                connection,
                `Dropping ${index.name} (concurrently)`,
                `DROP INDEX CONCURRENTLY IF EXISTS ${index.name}`,
            ),
        ),
    );
}
