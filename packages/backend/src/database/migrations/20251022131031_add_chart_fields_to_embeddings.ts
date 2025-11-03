import { Knex } from 'knex';

const EMBEDDING_TABLE_NAME = 'embedding';
const fields = {
    chart_uuids: 'chart_uuids',
    allow_all_charts: 'allow_all_charts',
};
export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(EMBEDDING_TABLE_NAME, fields.chart_uuids))
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table
                .specificType(fields.chart_uuids, 'text[]')
                .notNullable()
                .defaultTo('{}');
        });
    }
    if (
        !(await knex.schema.hasColumn(
            EMBEDDING_TABLE_NAME,
            fields.allow_all_charts,
        ))
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.boolean(fields.allow_all_charts).defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(EMBEDDING_TABLE_NAME, fields.chart_uuids)) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.dropColumn(fields.chart_uuids);
        });
    }
    if (
        await knex.schema.hasColumn(
            EMBEDDING_TABLE_NAME,
            fields.allow_all_charts,
        )
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.dropColumn(fields.allow_all_charts);
        });
    }
}
