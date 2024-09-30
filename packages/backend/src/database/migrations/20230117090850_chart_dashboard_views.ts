import { Knex } from 'knex';

const CHART_VIEWS_TABLE_NAME = 'analytics_chart_views';
const DASHBOARD_VIEWS_TABLE_NAME = 'analytics_dashboard_views';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table('saved_queries', (table) => {
        table.unique(['saved_query_uuid']);
    });
    await knex.schema.table('dashboards', (table) => {
        table.unique(['dashboard_uuid']);
    });

    await knex.schema.createTable(CHART_VIEWS_TABLE_NAME, (tableBuilder) => {
        tableBuilder
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        tableBuilder
            .uuid('chart_uuid')
            .notNullable()
            .references('saved_query_uuid')
            .inTable('saved_queries')
            .onDelete('CASCADE');
        tableBuilder.jsonb('context');
        tableBuilder
            .timestamp('timestamp', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.createTable(
        DASHBOARD_VIEWS_TABLE_NAME,
        (tableBuilder) => {
            tableBuilder
                .uuid('user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            tableBuilder
                .uuid('dashboard_uuid')
                .notNullable()
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('CASCADE');
            tableBuilder.jsonb('context');
            tableBuilder
                .timestamp('timestamp', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CHART_VIEWS_TABLE_NAME);
    await knex.schema.dropTableIfExists(DASHBOARD_VIEWS_TABLE_NAME);

    await knex.schema.alterTable('saved_queries', (t) => {
        t.dropUnique(['saved_query_uuid']);
    });
    await knex.schema.alterTable('dashboards', (t) => {
        t.dropUnique(['dashboard_uuid']);
    });
}
