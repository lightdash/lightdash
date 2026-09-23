import { Knex } from 'knex';

const AiPromptTableName = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiPromptTableName, (table) => {
            table.jsonb('quick_replies').nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AiPromptTableName, (table) => {
            table.dropColumn('quick_replies');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
