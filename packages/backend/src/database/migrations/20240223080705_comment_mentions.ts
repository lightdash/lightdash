import { Knex } from 'knex';

const dashboardTileCommentsTable = 'dashboard_tile_comments';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.alterTable(dashboardTileCommentsTable, (table) => {
        table
            .specificType('mentions', 'uuid[]')
            .notNullable()
            .defaultTo('{}')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.dropColumns('mentions');
    });
}
