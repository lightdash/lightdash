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
            .index()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('user_uuid').notNullable();
        table.uuid('comment_id').notNullable().index();
        table.uuid('comment_author_uuid').notNullable().index();
        table.uuid('dashboard_uuid').notNullable();
        table.boolean('viewed').notNullable().defaultTo(false);
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.uuid('dashboard_tile_uuid').index();

        table
            .foreign('user_uuid')
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('CASCADE');
        table
            .foreign('comment_author_uuid')
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('CASCADE');
        table
            .foreign('comment_id')
            .references('comment_id')
            .inTable(dashboardTileCommentsTable)
            .onDelete('CASCADE');
        table
            .foreign('dashboard_uuid')
            .references('dashboard_uuid')
            .inTable(dashboardsTable)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable(notificationsTable);
}
