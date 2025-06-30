import { Knex } from 'knex';

export const SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME =
    'saved_semantic_viewer_charts';
export const SAVED_SEMANTIC_VIEWER_CHART_VERSIONS_TABLE_NAME =
    'saved_semantic_viewer_chart_versions';

const DashboardTilesTable = 'dashboard_tiles';
const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileSemanticViewerChartsTable =
    'dashboard_tile_semantic_viewer_charts';
const semanticViewerChartType = 'semantic_viewer_chart';

export async function up(knex: Knex): Promise<void> {
    // First, delete any dashboard tiles that use the semantic_viewer_chart type
    await knex(DashboardTilesTable)
        .delete()
        .where('type', semanticViewerChartType);

    // Remove the tile type from dashboard_tile_types table
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', semanticViewerChartType);

    // Drop the semantic viewer chart tile table
    await knex.schema.dropTableIfExists(DashboardTileSemanticViewerChartsTable);

    // Drop the project_uuid index from saved_semantic_viewer_charts table
    if (await knex.schema.hasTable(SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME)) {
        await knex.schema.alterTable(
            SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME,
            (table) => {
                table.dropIndex(['project_uuid']);
            },
        );
    }

    // Drop tables in reverse order of creation (dependencies first)
    await knex.schema.dropTableIfExists(
        SAVED_SEMANTIC_VIEWER_CHART_VERSIONS_TABLE_NAME,
    );
    await knex.schema.dropTableIfExists(
        SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME,
    );
}

export async function down(knex: Knex): Promise<void> {
    // Recreate tables in the same order as the original migration
    if (
        !(await knex.schema.hasTable(SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME))
    ) {
        await knex.schema.createTable(
            SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME,
            (table) => {
                table
                    .uuid('saved_semantic_viewer_chart_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('project_uuid')
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');
                table
                    .uuid('space_uuid')
                    .nullable()
                    .references('space_uuid')
                    .inTable('spaces')
                    .onDelete('CASCADE')
                    .index();
                table
                    .uuid('dashboard_uuid')
                    .nullable()
                    .references('dashboard_uuid')
                    .inTable('dashboards')
                    .onDelete('CASCADE');
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table
                    .uuid('created_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
                table.text('name').notNullable();
                table.text('description').nullable();
                table
                    .string('last_version_chart_kind')
                    .defaultTo('vertical_bar');
                table
                    .timestamp('last_version_updated_at', { useTz: false })
                    .defaultTo(knex.fn.now());
                table
                    .uuid('last_version_updated_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
                table.text('slug').nullable().index();
                table.integer('views_count').defaultTo(0).notNullable();
                table.timestamp('first_viewed_at').nullable();
                table.timestamp('last_viewed_at').defaultTo(knex.fn.now());

                table.unique(['project_uuid', 'slug']);
            },
        );

        await knex.schema.createTable(
            SAVED_SEMANTIC_VIEWER_CHART_VERSIONS_TABLE_NAME,
            (table) => {
                table
                    .uuid('saved_semantic_viewer_chart_version_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('saved_semantic_viewer_chart_uuid')
                    .notNullable()
                    .references('saved_semantic_viewer_chart_uuid')
                    .inTable(SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME)
                    .onDelete('CASCADE')
                    .index();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.string('semantic_layer_view').nullable();
                table.jsonb('semantic_layer_query').defaultTo({});
                table.jsonb('config').defaultTo({});
                table.string('chart_kind').defaultTo('vertical_bar');
                table
                    .uuid('created_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
            },
        );

        // Recreate search vector column
        const customSearchConfigName = `lightdash_english_config`;
        await knex.raw(`
            ALTER TABLE ${SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME} ADD COLUMN search_vector tsvector
                GENERATED ALWAYS AS (
                setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
                setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
            ) STORED;
        `);

        // Recreate search vector index
        await knex.schema.alterTable(
            SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME,
            (table) => {
                table.index(
                    'search_vector',
                    'saved_semantic_viewer_charts_search_vector_idx',
                    'GIN',
                );
            },
        );

        // Recreate the project_uuid index
        await knex.schema.alterTable(
            SAVED_SEMANTIC_VIEWER_CHARTS_TABLE_NAME,
            (table) => {
                table.index(['project_uuid']);
            },
        );
    }

    // Recreate the semantic viewer chart tile type
    await knex(DashboardTileTypesTable).insert({
        dashboard_tile_type: semanticViewerChartType,
    });

    // Recreate the semantic viewer chart tile table
    if (!(await knex.schema.hasTable(DashboardTileSemanticViewerChartsTable))) {
        await knex.schema.createTable(
            DashboardTileSemanticViewerChartsTable,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));

                table
                    .uuid('saved_semantic_viewer_chart_uuid')
                    .references('saved_semantic_viewer_chart_uuid')
                    .inTable('saved_semantic_viewer_charts')
                    .nullable()
                    .onDelete('CASCADE');
                table.text('title').nullable();
                table.boolean('hide_title').defaultTo(false);

                table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
            },
        );
    }
}
