import { Knex } from 'knex';

const ANALYTICS_APP_VIEWS_TABLE_NAME = 'analytics_app_views';
const APPS_TABLE_NAME = 'apps';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(APPS_TABLE_NAME, (table) => {
        table.integer('views_count').defaultTo(0).notNullable();
    });

    await knex.schema.createTable(
        ANALYTICS_APP_VIEWS_TABLE_NAME,
        (tableBuilder) => {
            tableBuilder
                .uuid('user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');
            tableBuilder
                .uuid('app_id')
                .notNullable()
                .references('app_id')
                .inTable(APPS_TABLE_NAME)
                .onDelete('CASCADE');
            tableBuilder
                .timestamp('timestamp', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ANALYTICS_APP_VIEWS_TABLE_NAME);
    await knex.schema.table(APPS_TABLE_NAME, (table) => {
        table.dropColumn('views_count');
    });
}
