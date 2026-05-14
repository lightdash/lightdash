import { Knex } from 'knex';

// Disable transaction wrapping so CREATE INDEX CONCURRENTLY can be used.
// Each statement runs in its own implicit transaction. The migration is
// idempotent — a partial run can be safely resumed by re-running.
export const config = { transaction: false };

// EE tables that already have a UNIQUE constraint on NOT NULL columns. We
// build a fresh unique index, promote it to PRIMARY KEY, and drop the old
// UNIQUE constraint — no rewrite, no backfill, no long-held write lock.
const TABLES: ReadonlyArray<{
    table: string;
    columns: readonly string[];
    oldConstraint: string;
}> = [
    {
        table: 'ai_agent_group_access',
        columns: ['group_uuid', 'ai_agent_uuid'],
        oldConstraint: 'ai_agent_group_access_group_uuid_ai_agent_uuid_unique',
    },
    {
        table: 'ai_agent_user_access',
        columns: ['user_uuid', 'ai_agent_uuid'],
        oldConstraint: 'ai_agent_user_access_user_uuid_ai_agent_uuid_unique',
    },
    {
        table: 'embedding',
        columns: ['project_uuid'],
        oldConstraint: 'embedding_project_uuid_unique',
    },
];

async function promoteToPrimaryKey(
    knex: Knex,
    table: string,
    columns: readonly string[],
    oldConstraint: string,
): Promise<void> {
    const pkName = `${table}_pkey`;

    // If the PK already exists (idempotent re-run), make sure the old
    // UNIQUE constraint is dropped and exit.
    const existingPk = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass AND contype = 'p'`,
        [pkName, table],
    );
    if ((existingPk.rowCount ?? 0) > 0) {
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
            table,
            oldConstraint,
        ]);
        return;
    }

    // If a previous run crashed mid-build, drop the leftover INVALID index.
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
         WHERE c.relname = ? AND NOT i.indisvalid`,
        [pkName],
    );
    if ((invalidIndex.rowCount ?? 0) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [pkName]);
    }

    // Build the new unique index without blocking writes. We use a fresh
    // index rather than reusing the one behind the existing UNIQUE
    // constraint because PG won't let two constraints share a single index.
    const columnList = columns.map(() => '??').join(', ');
    await knex.raw(
        `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (${columnList})`,
        [pkName, table, ...columns],
    );

    // Promote the new index to PRIMARY KEY (brief lock, no scan).
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY USING INDEX ??`,
        [table, pkName, pkName],
    );

    // Drop the now-redundant UNIQUE constraint (this also drops its index).
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        table,
        oldConstraint,
    ]);
}

export async function up(knex: Knex): Promise<void> {
    for (const { table, columns, oldConstraint } of TABLES) {
        // eslint-disable-next-line no-console
        console.log(`Promoting UNIQUE on ${table} to PRIMARY KEY`);
        // eslint-disable-next-line no-await-in-loop
        await promoteToPrimaryKey(knex, table, columns, oldConstraint);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const { table, columns, oldConstraint } of TABLES) {
        const pkName = `${table}_pkey`;
        // Recreate the UNIQUE constraint first so the table never lacks
        // row identity, then drop the PRIMARY KEY.
        const columnList = columns.map(() => '??').join(', ');
        // eslint-disable-next-line no-await-in-loop
        const existingUnique = await knex.raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint
             WHERE conname = ? AND conrelid = ?::regclass AND contype = 'u'`,
            [oldConstraint, table],
        );
        if ((existingUnique.rowCount ?? 0) === 0) {
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(
                `ALTER TABLE ?? ADD CONSTRAINT ?? UNIQUE (${columnList})`,
                [table, oldConstraint, ...columns],
            );
        }
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
            table,
            pkName,
        ]);
    }
}
