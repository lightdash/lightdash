import { Knex } from 'knex';

const ValidationTableName = 'validations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.dropForeign('saved_chart_uuid');

        table
            .foreign('saved_chart_uuid')
            .references('saved_query_uuid')
            .inTable('saved_queries')
            .onDelete('SET NULL');

        table.dropForeign('dashboard_uuid');

        table
            .foreign('dashboard_uuid')
            .references('dashboard_uuid')
            .inTable('dashboards')
            .onDelete('SET NULL');

        table.string('source').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ValidationTableName, (table) => {
        table.dropForeign('saved_chart_uuid');

        table
            .foreign('saved_chart_uuid')
            .references('saved_query_uuid')
            .inTable('saved_queries')
            .onDelete('CASCADE');

        table.dropForeign('dashboard_uuid');

        table
            .foreign('dashboard_uuid')
            .references('dashboard_uuid')
            .inTable('dashboards')
            .onDelete('CASCADE');

        table.dropColumn('source');
    });
}
