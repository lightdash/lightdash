import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        'saved_queries_version_table_calculations',
        (tableBuilder) => {
            tableBuilder.jsonb('template').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        'saved_queries_version_table_calculations',
        (tableBuilder) => {
            tableBuilder.dropColumn('template');
        },
    );
}
