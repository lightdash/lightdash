import { Knex } from 'knex';

const PinnedListTableName = 'pinned_list';
const PinnedChartTableName = 'pinned_chart';
const PinnedDashboardTableName = 'pinned_dashboard';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.unique(['project_uuid']);
    });
    if (!(await knex.schema.hasTable(PinnedListTableName))) {
        await knex.schema.createTable(PinnedListTableName, (table) => {
            table
                .uuid('pinned_list_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .notNullable()
                .unique()
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
    if (!(await knex.schema.hasTable(PinnedChartTableName))) {
        await knex.schema.createTable(PinnedChartTableName, (table) => {
            table
                .uuid('pinned_item_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('pinned_list_uuid')
                .references('pinned_list_uuid')
                .inTable(PinnedListTableName)
                .notNullable()
                .onDelete('CASCADE');
            table
                .uuid('saved_chart_uuid')
                .references('saved_query_uuid')
                .inTable('saved_queries')
                .notNullable()
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['pinned_list_uuid', 'saved_chart_uuid']);
        });
    }
    if (!(await knex.schema.hasTable(PinnedDashboardTableName))) {
        await knex.schema.createTable(PinnedDashboardTableName, (table) => {
            table
                .uuid('pinned_item_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('pinned_list_uuid')
                .references('pinned_list_uuid')
                .inTable(PinnedListTableName)
                .notNullable()
                .onDelete('CASCADE');
            table
                .uuid('dashboard_uuid')
                .references('dashboard_uuid')
                .inTable('dashboards')
                .notNullable()
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.unique(['pinned_list_uuid', 'dashboard_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PinnedDashboardTableName);
    await knex.schema.dropTableIfExists(PinnedChartTableName);
    await knex.schema.dropTableIfExists(PinnedListTableName);
    await knex.schema.alterTable('projects', (table) => {
        table.dropUnique(['project_uuid']);
    });
}
