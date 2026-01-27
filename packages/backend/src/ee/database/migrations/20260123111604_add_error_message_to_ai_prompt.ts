import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, 'error_message'))) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.text('error_message').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, 'error_message')) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.dropColumn('error_message');
        });
    }
}
