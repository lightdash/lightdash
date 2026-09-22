import { Knex } from 'knex';

const tableName = 'data_app_analyses';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable integer columns to data_app_analyses; no reads affected.',
};

// Token usage and wall-clock of the model call behind each stored analysis,
// so per-app usage is a plain query.
export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(tableName, 'input_tokens')) return;
    await knex.schema.alterTable(tableName, (table) => {
        table.integer('input_tokens').nullable();
        table.integer('output_tokens').nullable();
        table.integer('latency_ms').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('input_tokens');
        table.dropColumn('output_tokens');
        table.dropColumn('latency_ms');
    });
}
