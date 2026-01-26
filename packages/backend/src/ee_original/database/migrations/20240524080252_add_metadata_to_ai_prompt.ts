import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AI_PROMPT_TABLE_NAME)) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.jsonb('filters_output').nullable();
            table.jsonb('viz_config_output').nullable();
            table.integer('human_score').nullable();
            table.jsonb('metric_query').nullable();
            table.dropColumn('response_metric_query');
            table.dropColumn('response_viz_config');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AI_PROMPT_TABLE_NAME)) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.dropColumn('filters_output');
            table.dropColumn('viz_config_output');
            table.dropColumn('human_score');
            table.dropColumn('metric_query');
            table.jsonb('response_metric_query').notNullable().defaultTo('{}');
            table.jsonb('response_viz_config').notNullable().defaultTo('{}');
        });
    }
}
