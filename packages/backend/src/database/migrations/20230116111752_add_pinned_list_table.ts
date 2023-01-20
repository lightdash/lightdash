import { Knex } from 'knex';

const PinnedListTableName = 'pinned_list';
const PinnedChartTableName = 'pinned_chart';
const PinnedDashboardTableName = 'pinned_dashboard';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (table) => {
        table.unique(['project_uuid']);
    });
    await knex.schema.alterTable('saved_queries', (table) => {
        table.unique(['saved_query_uuid']);
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.unique(['dashboard_uuid']);
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
                .nullable()
                .references('pinned_list_uuid')
                .inTable(PinnedListTableName)
                .onDelete('CASCADE');
            table
                .uuid('saved_chart_uuid')
                .nullable()
                .references('saved_query_uuid')
                .inTable('saved_queries')
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
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
                .nullable()
                .references('pinned_list_uuid')
                .inTable(PinnedListTableName)
                .onDelete('CASCADE');
            table
                .uuid('dashboard_uuid')
                .nullable()
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
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
    await knex.schema.alterTable('saved_queries', (table) => {
        table.dropUnique(['saved_query_uuid']);
    });
    await knex.schema.alterTable('dashboards', (table) => {
        table.dropUnique(['dashboard_uuid']);
    });
}
