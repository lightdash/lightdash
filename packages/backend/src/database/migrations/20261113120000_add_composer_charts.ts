import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates three new tables and adds one tile type row. The raw SQL is only lock_timeout and uuid_generate_v4() column defaults; the previous release never reads the new tables.',
} as const;

const DashboardTilesTable = 'dashboard_tiles';
const DashboardTileTypesTable = 'dashboard_tile_types';
const ComposerChartsTable = 'composer_charts';
const ComposerChartVersionsTable = 'composer_chart_versions';
const DashboardTileComposerChartsTable = 'dashboard_tile_composer_charts';

const composerChartTileType = 'composer_chart';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);

    await knex(DashboardTileTypesTable)
        .insert({ dashboard_tile_type: composerChartTileType })
        .onConflict('dashboard_tile_type')
        .ignore();

    if (!(await knex.schema.hasTable(ComposerChartsTable))) {
        await knex.schema.createTable(ComposerChartsTable, (table) => {
            table
                .uuid('composer_chart_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .uuid('dashboard_uuid')
                .nullable()
                .references('dashboard_uuid')
                .inTable('dashboards')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('space_uuid')
                .nullable()
                .references('space_uuid')
                .inTable('spaces')
                .onDelete('CASCADE')
                .index();
            table.text('name').notNullable();
            table.text('description').nullable();
            table.text('slug').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table.timestamp('deleted_at', { useTz: true }).nullable();
            table
                .uuid('deleted_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            // Also serves as the project_uuid FK index.
            table.unique(['project_uuid', 'slug']);
            table.check(
                '(?? IS NULL) <> (?? IS NULL)',
                ['dashboard_uuid', 'space_uuid'],
                'composer_charts_one_owner',
            );
        });
    }

    if (!(await knex.schema.hasTable(ComposerChartVersionsTable))) {
        await knex.schema.createTable(ComposerChartVersionsTable, (table) => {
            table
                .uuid('composer_chart_version_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('composer_chart_uuid')
                .notNullable()
                .references('composer_chart_uuid')
                .inTable(ComposerChartsTable)
                .onDelete('CASCADE')
                .index();
            table.jsonb('pipeline').notNullable();
            table.jsonb('chart').notNullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
        });
    }

    if (!(await knex.schema.hasTable(DashboardTileComposerChartsTable))) {
        await knex.schema.createTable(
            DashboardTileComposerChartsTable,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table.uuid('dashboard_tile_uuid').notNullable();
                table
                    .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                    .inTable(DashboardTilesTable)
                    .onDelete('CASCADE');
                table
                    .uuid('composer_chart_uuid')
                    .notNullable()
                    .references('composer_chart_uuid')
                    .inTable(ComposerChartsTable)
                    .onDelete('CASCADE')
                    .index();
                table.text('title').nullable();
                table.boolean('hide_title').notNullable().defaultTo(false);
                table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);

    await knex(DashboardTilesTable)
        .delete()
        .where('type', composerChartTileType);
    await knex.schema.dropTableIfExists(DashboardTileComposerChartsTable);
    await knex.schema.dropTableIfExists(ComposerChartVersionsTable);
    await knex.schema.dropTableIfExists(ComposerChartsTable);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', composerChartTileType);
}
