import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable warehouse_connection_uuid columns with deferred foreign keys added NOT VALID then validated and partial indexes built concurrently, so older binaries keep writing NULL',
} as const;

export const config = { transaction: false };

const LOCK_TIMEOUT = '5s';

type Binding = {
    table: string;
    foreignKey: { name: string; definition: string } | null;
    index: { name: string; predicate: string } | null;
};

const BINDINGS: Binding[] = [
    {
        table: 'cached_explore',
        foreignKey: {
            name: 'cached_explore_warehouse_connection_fkey',
            definition:
                'FOREIGN KEY (project_uuid, warehouse_connection_uuid) REFERENCES warehouse_connections (project_uuid, warehouse_connection_uuid)',
        },
        index: {
            name: 'cached_explore_warehouse_connection_uuid_idx',
            predicate: 'warehouse_connection_uuid IS NOT NULL',
        },
    },
    {
        table: 'cached_explore_staging',
        foreignKey: null,
        index: null,
    },
    {
        table: 'project_dbt_sources',
        foreignKey: {
            name: 'project_dbt_sources_warehouse_connection_fkey',
            definition:
                'FOREIGN KEY (project_uuid, warehouse_connection_uuid) REFERENCES warehouse_connections (project_uuid, warehouse_connection_uuid)',
        },
        index: {
            name: 'project_dbt_sources_warehouse_connection_uuid_idx',
            predicate: 'warehouse_connection_uuid IS NOT NULL',
        },
    },
    {
        table: 'saved_sql_versions',
        foreignKey: {
            name: 'saved_sql_versions_warehouse_connection_fkey',
            definition:
                'FOREIGN KEY (warehouse_connection_uuid) REFERENCES warehouse_connections (warehouse_connection_uuid)',
        },
        index: {
            name: 'saved_sql_versions_warehouse_connection_uuid_idx',
            predicate: 'warehouse_connection_uuid IS NOT NULL',
        },
    },
    {
        table: 'query_history',
        foreignKey: null,
        index: {
            name: 'query_history_active_warehouse_connection_uuid_idx',
            predicate: "status IN ('pending', 'queued', 'executing')",
        },
    },
];

const runDdl = async (
    knex: Knex,
    connection: unknown,
    message: string,
    sql: string,
): Promise<void> => {
    console.log(message);
    if (sql.includes('CONCURRENTLY')) {
        await knex.raw('RESET lock_timeout').connection(connection);
    } else {
        await knex
            .raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`)
            .connection(connection);
    }
    try {
        await knex.raw(sql).connection(connection);
    } finally {
        await knex.raw('RESET lock_timeout').connection(connection);
    }
};

const hasRows = async (
    knex: Knex,
    connection: unknown,
    sql: string,
    bindings: string[] = [],
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(sql, bindings)
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const constraintExists = (
    knex: Knex,
    connection: unknown,
    table: string,
    constraint: string,
) =>
    hasRows(
        knex,
        connection,
        `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
        [constraint, table],
    );

const bindingColumnExists = (knex: Knex, connection: unknown, table: string) =>
    hasRows(
        knex,
        connection,
        `SELECT 1 FROM pg_attribute
         WHERE attrelid = ?::regclass
           AND attname = 'warehouse_connection_uuid'
           AND NOT attisdropped`,
        [table],
    );

const dropInvalidIndex = async (
    knex: Knex,
    connection: unknown,
    indexName: string,
): Promise<void> => {
    if (
        await hasRows(
            knex,
            connection,
            `SELECT 1
             FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE c.relname = ? AND NOT i.indisvalid`,
            [indexName],
        )
    ) {
        await runDdl(
            knex,
            connection,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

const addBinding = async (
    knex: Knex,
    connection: unknown,
    binding: Binding,
): Promise<void> => {
    const addForeignKey =
        binding.foreignKey !== null &&
        !(await constraintExists(
            knex,
            connection,
            binding.table,
            binding.foreignKey.name,
        ));
    await runDdl(
        knex,
        connection,
        `Adding ${binding.table}.warehouse_connection_uuid`,
        [
            `ALTER TABLE ${binding.table} ADD COLUMN IF NOT EXISTS warehouse_connection_uuid uuid NULL`,
            ...(addForeignKey && binding.foreignKey
                ? [
                      `ADD CONSTRAINT ${binding.foreignKey.name} ${binding.foreignKey.definition} DEFERRABLE INITIALLY DEFERRED NOT VALID`,
                  ]
                : []),
        ].join(', '),
    );
    if (binding.foreignKey) {
        await runDdl(
            knex,
            connection,
            `Validating ${binding.foreignKey.name}`,
            `ALTER TABLE ${binding.table} VALIDATE CONSTRAINT ${binding.foreignKey.name}`,
        );
    }
    if (binding.index) {
        await dropInvalidIndex(knex, connection, binding.index.name);
        await runDdl(
            knex,
            connection,
            `Creating ${binding.index.name} (concurrently)`,
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${binding.index.name} ON ${binding.table} (warehouse_connection_uuid) WHERE ${binding.index.predicate}`,
        );
    }
};

const removeBinding = async (
    knex: Knex,
    connection: unknown,
    binding: Binding,
): Promise<void> => {
    if (binding.index) {
        await runDdl(
            knex,
            connection,
            `Dropping ${binding.index.name} (concurrently)`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${binding.index.name}`,
        );
    }
    if (await bindingColumnExists(knex, connection, binding.table)) {
        await runDdl(
            knex,
            connection,
            `Dropping ${binding.table}.warehouse_connection_uuid`,
            `ALTER TABLE ${binding.table} DROP COLUMN IF EXISTS warehouse_connection_uuid`,
        );
    }
};

const findReversalBlockers = async (
    knex: Knex,
    connection: unknown,
): Promise<string[]> => {
    const blockers: string[] = [];
    const hasConnectionMode = await hasRows(
        knex,
        connection,
        `SELECT 1 FROM pg_attribute
         WHERE attrelid = 'projects'::regclass
           AND attname = 'connection_mode'
           AND NOT attisdropped`,
    );
    if (
        hasConnectionMode &&
        (await hasRows(
            knex,
            connection,
            `SELECT 1 FROM projects WHERE connection_mode = 'multi' LIMIT 1`,
        ))
    ) {
        blockers.push('a project uses multiple warehouse connections');
    }
    const hasConnections = await hasRows(
        knex,
        connection,
        `SELECT 1 WHERE to_regclass('warehouse_connections') IS NOT NULL`,
    );
    if (
        hasConnections &&
        (await hasRows(
            knex,
            connection,
            `SELECT 1 FROM warehouse_connections WHERE NOT is_original LIMIT 1`,
        ))
    ) {
        blockers.push('a project has an extra warehouse connection');
    }
    return blockers;
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
        await migrate(connection);
    } finally {
        try {
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, (connection) =>
        inSequence(BINDINGS, (binding) =>
            addBinding(knex, connection, binding),
        ),
    );
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        const blockers = await findReversalBlockers(knex, connection);
        if (blockers.length > 0) {
            throw new Error(
                `irreversible: ${blockers.join(
                    ', ',
                )}, and dropping the warehouse connection bindings would lose which connection content uses`,
            );
        }
        await inSequence([...BINDINGS].reverse(), (binding) =>
            removeBinding(knex, connection, binding),
        );
    });
}
