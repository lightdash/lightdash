import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(
            AI_PROMPT_TABLE_NAME,
            'context_compacted',
        ))
    ) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.boolean('context_compacted').nullable().defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            AI_PROMPT_TABLE_NAME,
            'context_compacted',
        )
    ) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.dropColumn('context_compacted');
        });
    }
}
