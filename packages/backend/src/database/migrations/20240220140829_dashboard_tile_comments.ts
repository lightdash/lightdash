import { Knex } from 'knex';

const dashboardTileCommentsTable = 'dashboard_tile_comments';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable(dashboardTileCommentsTable, (table) => {
        table
            .uuid('comment_id')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('text');
        table.uuid('reply_to').nullable();
        table
            .foreign('reply_to')
            .references(`comment_id`)
            .inTable(dashboardTileCommentsTable)
            .onDelete('SET NULL');
        table.uuid('dashboard_tile_uuid').index();
        table.uuid('user_uuid');
        table.foreign('user_uuid').references('user_uuid').inTable(usersTable);
        table.boolean('resolved').defaultTo(false);
        table
            .specificType('mentions', 'uuid[]')
            .notNullable()
            .defaultTo('{}')
            .index();
        table
            .uuid('saved_chart_uuid')
            .nullable()
            .references('saved_query_uuid')
            .inTable('saved_queries')
            .onDelete('CASCADE')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable(dashboardTileCommentsTable);
}
