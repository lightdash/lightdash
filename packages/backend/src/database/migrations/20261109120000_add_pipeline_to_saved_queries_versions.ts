import { Knex } from 'knex';

const TableName = 'saved_queries_versions';
const ConstraintName = 'saved_queries_versions_query_source_check';
const NotNullCheckName = 'saved_queries_versions_explore_name_not_null_check';

// VALIDATE must run outside the transaction that added the constraint, or
// the scan happens under the ACCESS EXCLUSIVE lock the ADD took.
export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable pipeline column, drops NOT NULL on saved_queries_versions.explore_name and validates the CHECK outside the exclusive lock; the previous release writes explore_name on every version and never reads pipeline, so every row it writes satisfies the constraint.',
} as const;

// Session settings only apply to one connection, so pin every statement to it.
const withDdlSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '60s'").connection(connection);
        await run(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

const constraintExists = async (
    knex: Knex,
    connection: unknown,
    constraintName: string,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint WHERE conrelid = ?::regclass AND conname = ?`,
            [TableName, constraintName],
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

export async function up(knex: Knex): Promise<void> {
    await withDdlSession(knex, async (connection) => {
        await knex
            .raw(
                `ALTER TABLE ${TableName} ADD COLUMN IF NOT EXISTS pipeline jsonb`,
            )
            .connection(connection);
        await knex
            .raw(
                `ALTER TABLE ${TableName} ALTER COLUMN explore_name DROP NOT NULL`,
            )
            .connection(connection);
        if (!(await constraintExists(knex, connection, ConstraintName))) {
            await knex
                .raw(
                    `ALTER TABLE ${TableName} ADD CONSTRAINT ${ConstraintName} CHECK ((explore_name IS NULL) <> (pipeline IS NULL)) NOT VALID`,
                )
                .connection(connection);
        }
        console.log(`Validating ${ConstraintName} on ${TableName}`);
        await knex
            .raw(
                `ALTER TABLE ${TableName} VALIDATE CONSTRAINT ${ConstraintName}`,
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    const composerRow = await knex(TableName)
        .whereNotNull('pipeline')
        .first('saved_queries_version_id');
    if (composerRow) {
        throw new Error(
            'irreversible: composer chart versions have no explore; delete them before rolling back',
        );
    }
    await withDdlSession(knex, async (connection) => {
        await knex
            .raw(
                `ALTER TABLE ${TableName} DROP CONSTRAINT IF EXISTS ${ConstraintName}`,
            )
            .connection(connection);
        // A validated CHECK makes SET NOT NULL skip the table scan.
        if (!(await constraintExists(knex, connection, NotNullCheckName))) {
            await knex
                .raw(
                    `ALTER TABLE ${TableName} ADD CONSTRAINT ${NotNullCheckName} CHECK (explore_name IS NOT NULL) NOT VALID`,
                )
                .connection(connection);
        }
        await knex
            .raw(
                `ALTER TABLE ${TableName} VALIDATE CONSTRAINT ${NotNullCheckName}`,
            )
            .connection(connection);
        await knex
            .raw(
                `ALTER TABLE ${TableName} ALTER COLUMN explore_name SET NOT NULL`,
            )
            .connection(connection);
        await knex
            .raw(
                `ALTER TABLE ${TableName} DROP CONSTRAINT IF EXISTS ${NotNullCheckName}`,
            )
            .connection(connection);
        await knex
            .raw(`ALTER TABLE ${TableName} DROP COLUMN IF EXISTS pipeline`)
            .connection(connection);
    });
}
