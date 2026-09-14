import { Knex } from 'knex';

const AiPromptTableName = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiPromptTableName, (table) => {
        table.jsonb('response_timing').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiPromptTableName, (table) => {
        table.dropColumn('response_timing');
    });
}
