import { Knex } from 'knex';

const PreAggregateDailyStatsTableName = 'pre_aggregate_daily_stats';
const ProjectsTableName = 'projects';
const SavedQueriesTableName = 'saved_queries';
const DashboardsTableName = 'dashboards';

export async function up(knex: Knex): Promise<void> {
    // Create pre_aggregate_daily_stats table
    await knex.schema.createTable(PreAggregateDailyStatsTableName, (table) => {
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(ProjectsTableName)
            .onDelete('CASCADE');
        table.text('explore_name').notNullable();
        table.date('date').notNullable();
        table
            .uuid('chart_uuid')
            .nullable()
            .references('saved_query_uuid')
            .inTable(SavedQueriesTableName)
            .onDelete('CASCADE');
        table
            .uuid('dashboard_uuid')
            .nullable()
            .references('dashboard_uuid')
            .inTable(DashboardsTableName)
            .onDelete('CASCADE');
        table.text('query_context').notNullable();
        table.integer('hit_count').notNullable().defaultTo(0);
        table.integer('miss_count').notNullable().defaultTo(0);
        table.text('miss_reason').nullable();
        table.text('pre_aggregate_name').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // Use a unique index with COALESCE expressions to handle nullable columns
    // PostgreSQL doesn't allow expressions in PRIMARY KEY definitions,
    // but UNIQUE INDEX on expressions works and can be used with ON CONFLICT
    await knex.raw(`
        CREATE UNIQUE INDEX pre_aggregate_daily_stats_ukey
        ON ${PreAggregateDailyStatsTableName} (
            project_uuid, explore_name, date, query_context,
            COALESCE(chart_uuid, '00000000-0000-0000-0000-000000000000'),
            COALESCE(dashboard_uuid, '00000000-0000-0000-0000-000000000000')
        )
    `);

    // Create index for project+date lookups
    await knex.raw(`
        CREATE INDEX idx_pre_agg_stats_project_date
        ON ${PreAggregateDailyStatsTableName} (project_uuid, date)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PreAggregateDailyStatsTableName);
}
