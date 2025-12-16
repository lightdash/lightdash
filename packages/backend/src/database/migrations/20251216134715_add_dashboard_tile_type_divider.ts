import { Knex } from 'knex';

const TABLE_NAMES = {
    dashboardTileTypes: 'dashboard_tile_types',
    dashboardTiles: 'dashboard_tiles',
    dashboardTileDividers: 'dashboard_tile_dividers',
};

export async function up(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTileTypes).insert([
        { dashboard_tile_type: 'divider' },
    ]);

    if (!(await knex.schema.hasTable(TABLE_NAMES.dashboardTileDividers))) {
        await knex.schema.createTable(
            TABLE_NAMES.dashboardTileDividers,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
                table
                    .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .inTable(TABLE_NAMES.dashboardTiles)
                    .onDelete('CASCADE');
                table.specificType('orientation', 'VARCHAR(10)').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTiles).delete().where('type', 'divider');
    await knex(TABLE_NAMES.dashboardTileTypes)
        .delete()
        .where('dashboard_tile_type', 'divider');
    await knex.schema.dropTableIfExists(TABLE_NAMES.dashboardTileDividers);
}
