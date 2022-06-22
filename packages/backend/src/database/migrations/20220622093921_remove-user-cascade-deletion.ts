import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Change onDelete from 'CASCADE' to 'SET_NULL'
    await knex.schema.alterTable('saved_queries_versions', (tableBuilder) => {
        tableBuilder.dropForeign('updated_by_user_uuid');
        tableBuilder
            .foreign('updated_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });

    await knex.schema.alterTable('dashboard_versions', (tableBuilder) => {
        tableBuilder.dropForeign('updated_by_user_uuid');
        tableBuilder
            .foreign('updated_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });

    // Delete all invalid saved charts and dashboards
    await knex('saved_queries')
        .whereNotExists(
            knex('saved_queries_versions')
                .select('*')
                .whereRaw(
                    'saved_queries.saved_query_id = saved_queries_versions.saved_query_id',
                ),
        )
        .delete();

    await knex('dashboards')
        .whereNotExists(
            knex('dashboard_versions')
                .select('*')
                .whereRaw(
                    'dashboards.dashboard_id = dashboard_versions.dashboard_id',
                ),
        )
        .delete();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function down(knex: Knex): Promise<void> {}
