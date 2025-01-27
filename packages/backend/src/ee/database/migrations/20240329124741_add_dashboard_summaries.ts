import { Knex } from 'knex';

const DASHBOARD_SUMMARIES_TABLE_NAME = 'dashboard_summaries';
const DASHBOARDS_TABLE_NAME = 'dashboards';
const DASHBOARD_VERSIONS_TABLE_NAME = 'dashboard_versions';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(DASHBOARD_SUMMARIES_TABLE_NAME))) {
        await knex.schema.createTable(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('dashboard_summary_uuid')
                    .primary()
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));

                // saving dashboard_uuid so that we can easily query the latest summary for a dashboard rather than having to join with dashboard_versions
                tableBuilder
                    .uuid('dashboard_uuid')
                    .notNullable()
                    .references('dashboard_uuid')
                    .inTable(DASHBOARDS_TABLE_NAME)
                    .onDelete('CASCADE');

                tableBuilder
                    .integer('dashboard_version_id')
                    .notNullable()
                    .references('dashboard_version_id')
                    .inTable(DASHBOARD_VERSIONS_TABLE_NAME)
                    .onDelete('CASCADE');

                tableBuilder.index(['dashboard_uuid', 'dashboard_version_id']);
                tableBuilder.text('summary').notNullable();
                tableBuilder.text('context');

                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(DASHBOARD_SUMMARIES_TABLE_NAME);
}
