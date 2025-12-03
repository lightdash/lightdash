import { Knex } from 'knex';

const ChartTypesTableName = 'chart_types';

export async function up(knex: Knex): Promise<void> {
    await knex(ChartTypesTableName).insert({ chart_type: 'sankey' });
}

export async function down(knex: Knex): Promise<void> {
    await knex(ChartTypesTableName).where('chart_type', 'sankey').delete();
}
