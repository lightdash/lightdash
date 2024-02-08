import { Knex } from 'knex';

const notificationsTable = 'notifications';
const dashboardTileCommentsTable = 'dashboard_tile_comments';
const usersTable = 'users';
const dashboardsTable = 'dashboards';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable(notificationsTable, (table) => {
        table
            .uuid('notification_id')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('user_uuid').notNullable();
        table.uuid('comment_id').notNullable();
        table.uuid('dashboard_uuid').notNullable();
        table.boolean('viewed').notNullable().defaultTo(false);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table
            .foreign('user_uuid')
            .references(`${usersTable}.user_uuid`)
            .onDelete('CASCADE');
        table
            .foreign('comment_id')
            .references(`${dashboardTileCommentsTable}.comment_id`)
            .onDelete('CASCADE');
        table
            .foreign('dashboard_uuid')
            .references(`${dashboardsTable}.dashboard_uuid`)
            .onDelete('CASCADE');
        table.uuid('dashboard_tile_uuid').index();

        table.index(['user_uuid', 'viewed'], 'idx_notifications_user_viewed');
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable(notificationsTable);
}
