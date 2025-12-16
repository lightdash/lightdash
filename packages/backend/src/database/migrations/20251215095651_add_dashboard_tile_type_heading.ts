import { Knex } from 'knex';

const TABLE_NAMES = {
    dashboardTileTypes: 'dashboard_tile_types',
    dashboardTiles: 'dashboard_tiles',
    dashboardTileHeadings: 'dashboard_tile_headings',
};

export async function up(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTileTypes).insert([
        { dashboard_tile_type: 'heading' },
    ]);

    if (!(await knex.schema.hasTable(TABLE_NAMES.dashboardTileHeadings))) {
        await knex.schema.createTable(
            TABLE_NAMES.dashboardTileHeadings,
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
                table.text('text').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTiles).delete().where('type', 'heading');
    await knex(TABLE_NAMES.dashboardTileTypes)
        .delete()
        .where('dashboard_tile_type', 'heading');
    await knex.schema.dropTableIfExists(TABLE_NAMES.dashboardTileHeadings);
}
