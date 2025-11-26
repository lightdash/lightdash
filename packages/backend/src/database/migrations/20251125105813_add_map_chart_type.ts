import { Knex } from 'knex';

const ChartTypesTableName = 'chart_types';

export async function up(knex: Knex): Promise<void> {
    await knex(ChartTypesTableName).insert({ chart_type: 'map' });
}

export async function down(knex: Knex): Promise<void> {
    await knex(ChartTypesTableName).where('chart_type', 'map').delete();
}
