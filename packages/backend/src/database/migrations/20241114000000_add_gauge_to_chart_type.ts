import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('chart_types').insert({ chart_type: 'gauge' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('saved_queries_versions').where('chart_type', 'gauge').delete();
    await knex('chart_types').delete().where('chart_type', 'gauge');
}
