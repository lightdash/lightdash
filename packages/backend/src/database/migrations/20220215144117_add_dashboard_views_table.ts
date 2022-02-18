import { Knex } from 'knex';

const DashboardViewsTableName = 'dashboard_views';
const DashboardVersionsTableName = 'dashboard_versions';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(DashboardViewsTableName))) {
        await knex.schema.createTable(DashboardViewsTableName, (table) => {
            table
                .uuid('dashboard_view_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.text('name').notNullable();
            table
                .integer('dashboard_version_id')
                .notNullable()
                .references('dashboard_version_id')
                .inTable(DashboardVersionsTableName)
                .onDelete('CASCADE');
            table.jsonb('filters').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(DashboardViewsTableName);
}
