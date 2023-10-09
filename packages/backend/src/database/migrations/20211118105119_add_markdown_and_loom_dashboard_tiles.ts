import { Knex } from 'knex';

const TABLE_NAMES = {
    dashboardTileTypes: 'dashboard_tile_types',
    dashboardTiles: 'dashboard_tiles',
    dashboardTileMarkdowns: 'dashboard_tile_markdowns',
    dashboardTileLooms: 'dashboard_tile_looms',
};

export async function up(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTileTypes).insert([
        { dashboard_tile_type: 'markdown' },
        { dashboard_tile_type: 'loom' },
    ]);

    if (!(await knex.schema.hasTable(TABLE_NAMES.dashboardTileMarkdowns))) {
        await knex.schema.createTable(
            TABLE_NAMES.dashboardTileMarkdowns,
            (tableBuilder) => {
                tableBuilder.integer('dashboard_version_id').notNullable();
                tableBuilder
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder.primary([
                    'dashboard_version_id',
                    'dashboard_tile_uuid',
                ]);
                tableBuilder
                    .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .inTable(TABLE_NAMES.dashboardTiles)
                    .onDelete('CASCADE');
                tableBuilder.text('title').notNullable();
                tableBuilder.text('content').notNullable();
            },
        );
    }
    if (!(await knex.schema.hasTable(TABLE_NAMES.dashboardTileLooms))) {
        await knex.schema.createTable(
            TABLE_NAMES.dashboardTileLooms,
            (tableBuilder) => {
                tableBuilder.integer('dashboard_version_id').notNullable();
                tableBuilder
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder.primary([
                    'dashboard_version_id',
                    'dashboard_tile_uuid',
                ]);
                tableBuilder
                    .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .inTable(TABLE_NAMES.dashboardTiles)
                    .onDelete('CASCADE');
                tableBuilder.text('title').notNullable();
                tableBuilder.text('url').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(TABLE_NAMES.dashboardTiles)
        .delete()
        .whereIn('type', ['loom', 'markdown']);
    await knex(TABLE_NAMES.dashboardTileTypes)
        .delete()
        .whereIn('dashboard_tile_type', ['loom', 'markdown']);
    await knex.schema.dropTableIfExists(TABLE_NAMES.dashboardTileMarkdowns);
    await knex.schema.dropTableIfExists(TABLE_NAMES.dashboardTileLooms);
}
