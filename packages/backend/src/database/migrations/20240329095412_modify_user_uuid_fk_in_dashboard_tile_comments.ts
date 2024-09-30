import { Knex } from 'knex';

const dashboardTileCommentsTable = 'dashboard_tile_comments';
const usersTable = 'users';
const userUuidColumnName = 'user_uuid';
const constraintName = 'dashboard_tile_comments_user_uuid_foreign';

export async function up(knex: Knex): Promise<void> {
    // Drop existing
    await knex.schema.table(dashboardTileCommentsTable, (table) => {
        table.dropForeign([userUuidColumnName], constraintName);
    });

    // Re-add foreign key back with on delete cascade
    await knex.schema.table(dashboardTileCommentsTable, (table) => {
        table
            .foreign(userUuidColumnName, constraintName)
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(dashboardTileCommentsTable, (table) => {
        table.dropForeign([userUuidColumnName], constraintName);
    });

    await knex.schema.table(dashboardTileCommentsTable, (table) => {
        table
            .foreign(userUuidColumnName, constraintName)
            .references('user_uuid')
            .inTable(usersTable);
    });
}
