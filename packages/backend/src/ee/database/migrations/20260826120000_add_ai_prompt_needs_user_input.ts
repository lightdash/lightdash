import type { Knex } from 'knex';

const TABLE_NAME = 'ai_prompt';

export const classification = {
    kind: 'safe',
    reason: 'Adds two nullable columns without a default or backfill; existing reads and writes are unchanged.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TABLE_NAME, (table) => {
            table.boolean('needs_user_input').nullable();
            table.jsonb('needs_user_input_metadata').nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TABLE_NAME, (table) => {
            table.dropColumn('needs_user_input');
            table.dropColumn('needs_user_input_metadata');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
