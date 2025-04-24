import { Knex } from 'knex';

const EMBEDDING_TABLE_NAME = 'embedding';
export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(
            EMBEDDING_TABLE_NAME,
            'allow_all_dashboards',
        ))
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.boolean('allow_all_dashboards').defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            EMBEDDING_TABLE_NAME,
            'allow_all_dashboards',
        )
    ) {
        await knex.schema.alterTable(EMBEDDING_TABLE_NAME, (table) => {
            table.dropColumn('allow_all_dashboards');
        });
    }
}
