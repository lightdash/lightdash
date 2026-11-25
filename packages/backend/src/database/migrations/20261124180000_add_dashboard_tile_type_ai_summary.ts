import { Knex } from 'knex';

const DashboardTilesTable = 'dashboard_tiles';
const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileAiSummariesTable = 'dashboard_tile_ai_summaries';

const aiSummaryType = 'ai_summary';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex(DashboardTileTypesTable)
        .insert({ dashboard_tile_type: aiSummaryType })
        .onConflict('dashboard_tile_type')
        .ignore();

    if (!(await knex.schema.hasTable(DashboardTileAiSummariesTable))) {
        await knex.schema.createTable(
            DashboardTileAiSummariesTable,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table.uuid('dashboard_tile_uuid').notNullable();
                table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
                table
                    .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .inTable(DashboardTilesTable)
                    .onDelete('CASCADE');
                table.text('title').nullable();
                table.jsonb('config').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex(DashboardTilesTable).delete().where('type', aiSummaryType);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', aiSummaryType);
    await knex.schema.dropTableIfExists(DashboardTileAiSummariesTable);
}
