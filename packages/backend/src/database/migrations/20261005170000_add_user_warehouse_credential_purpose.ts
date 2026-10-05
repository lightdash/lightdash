import { Knex } from 'knex';

export const config = { transaction: false };
export const classification: { kind: 'safe'; reason: string } = {
    kind: 'safe',
    reason: 'Existing credentials retain the default purpose and the AI-only unique index builds concurrently.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET lock_timeout = 5000');
    await knex.raw('SET statement_timeout = 0');
    try {
        if (
            !(await knex.schema.hasColumn(
                'user_warehouse_credentials',
                'purpose',
            ))
        ) {
            await knex.schema.alterTable(
                'user_warehouse_credentials',
                (table) => {
                    table.text('purpose').notNullable().defaultTo('default');
                },
            );
        }
        const indexState = (await knex.raw(
            "SELECT i.indisvalid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'user_warehouse_credentials_ai_identity_unique'",
        )) as { rows: Array<{ indisvalid: boolean }> };
        if (indexState.rows[0]?.indisvalid === false) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS user_warehouse_credentials_ai_identity_unique',
            );
        }
        await knex.raw(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS user_warehouse_credentials_ai_identity_unique ON user_warehouse_credentials (user_uuid, warehouse_type) WHERE purpose = 'ai'",
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET lock_timeout = 5000');
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS user_warehouse_credentials_ai_identity_unique',
        );
        if (
            await knex.schema.hasColumn('user_warehouse_credentials', 'purpose')
        ) {
            await knex.schema.alterTable(
                'user_warehouse_credentials',
                (table) => {
                    table.dropColumn('purpose');
                },
            );
        }
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}
