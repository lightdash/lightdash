import { Knex } from 'knex';

const PRE_AGGREGATE_DEFINITIONS_TABLE = 'pre_aggregate_definitions';
const PRE_AGGREGATE_MATERIALIZATIONS_TABLE = 'pre_aggregate_materializations';
const PROJECTS_TABLE = 'projects';
const CACHED_EXPLORE_TABLE = 'cached_explore';

const IDX_PRE_AGG_DEFS_PROJECT_REFRESH_CRON =
    'idx_pre_agg_defs_project_refresh_cron';
const IDX_PRE_AGG_DEFS_PROJECT_SOURCE_EXPLORE =
    'idx_pre_agg_defs_project_source_explore';
const IDX_PRE_AGG_DEFS_PRE_AGG_CACHED_EXPLORE =
    'idx_pre_agg_defs_pre_agg_cached_explore';
const FK_PRE_AGG_MAT_PRE_AGG_DEF =
    'fk_pre_agg_mat_pre_aggregate_definition_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table
            .uuid('pre_aggregate_definition_uuid')
            .notNullable()
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');

        table
            .uuid('source_cached_explore_uuid')
            .notNullable()
            .references('cached_explore_uuid')
            .inTable(CACHED_EXPLORE_TABLE)
            .onDelete('CASCADE');

        table
            .uuid('pre_agg_cached_explore_uuid')
            .notNullable()
            .references('cached_explore_uuid')
            .inTable(CACHED_EXPLORE_TABLE)
            .onDelete('CASCADE');

        table.jsonb('pre_aggregate_definition').notNullable();
        table.jsonb('materialization_metric_query').nullable();
        table.text('materialization_query_error').nullable();
        table.string('refresh_cron').nullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.raw(`
        CREATE INDEX ${IDX_PRE_AGG_DEFS_PROJECT_REFRESH_CRON}
        ON ${PRE_AGGREGATE_DEFINITIONS_TABLE} (project_uuid, refresh_cron)
        WHERE refresh_cron IS NOT NULL
    `);

    await knex.raw(`
        CREATE INDEX ${IDX_PRE_AGG_DEFS_PROJECT_SOURCE_EXPLORE}
        ON ${PRE_AGGREGATE_DEFINITIONS_TABLE} (project_uuid, source_cached_explore_uuid)
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX ${IDX_PRE_AGG_DEFS_PRE_AGG_CACHED_EXPLORE}
        ON ${PRE_AGGREGATE_DEFINITIONS_TABLE} (pre_agg_cached_explore_uuid)
    `);

    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table
                .foreign(
                    'pre_aggregate_definition_uuid',
                    FK_PRE_AGG_MAT_PRE_AGG_DEF,
                )
                .references('pre_aggregate_definition_uuid')
                .inTable(PRE_AGGREGATE_DEFINITIONS_TABLE)
                .onDelete('CASCADE');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table.dropForeign(
                'pre_aggregate_definition_uuid',
                FK_PRE_AGG_MAT_PRE_AGG_DEF,
            );
        },
    );
    await knex.raw(
        `DROP INDEX IF EXISTS ${IDX_PRE_AGG_DEFS_PRE_AGG_CACHED_EXPLORE}`,
    );
    await knex.raw(
        `DROP INDEX IF EXISTS ${IDX_PRE_AGG_DEFS_PROJECT_SOURCE_EXPLORE}`,
    );
    await knex.raw(
        `DROP INDEX IF EXISTS ${IDX_PRE_AGG_DEFS_PROJECT_REFRESH_CRON}`,
    );
    await knex.schema.dropTableIfExists(PRE_AGGREGATE_DEFINITIONS_TABLE);
}
