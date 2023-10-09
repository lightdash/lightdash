import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('chart_types').insert({ chart_type: 'big_number' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('saved_queries_versions')
        .where('chart_type', 'big_number')
        .delete();
    await knex('chart_types').delete().where('chart_type', 'big_number');
}
