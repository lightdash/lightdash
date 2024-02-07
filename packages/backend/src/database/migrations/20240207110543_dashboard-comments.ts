import { Knex } from 'knex';

const dashboardTileCommentsTable = 'dashboard_tile_comments';
const dashboardTilesTable = 'dashboard_tiles';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable(dashboardTileCommentsTable, (table) => {
        table.uuid('comment_id').primary();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.text('text');
        table.uuid('reply_to').nullable();
        table
            .foreign('reply_to')
            .references(`${dashboardTileCommentsTable}.comment_id`)
            .onDelete('SET NULL');
        table.uuid('dashboard_tile_uuid');
        table
            .foreign('dashboard_tile_uuid')
            .references(`${dashboardTilesTable}.dashboard_tile_uuid`)
            .onDelete('CASCADE');
        table.uuid('user_uuid');
        table.foreign('user_uuid').references(`${usersTable}.user_uuid`);
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable('dashboard_tile_comments');
}
