import { Knex } from 'knex';

const PRE_AGGREGATE_MATERIALIZATIONS_TABLE = 'pre_aggregate_materializations';
const PROJECTS_TABLE = 'projects';
const QUERY_HISTORY_TABLE = 'query_history';

const IDX_PROJECT_DEFINITION_STATUS =
    'idx_pre_agg_mat_project_definition_status';
const IDX_PROJECT_STATUS = 'idx_pre_agg_mat_project_status';
const IDX_ACTIVE_DEFINITION = 'idx_pre_agg_mat_active_definition';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table
                .uuid('pre_aggregate_materialization_uuid')
                .notNullable()
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable(PROJECTS_TABLE)
                .onDelete('CASCADE');

            table.uuid('pre_aggregate_definition_uuid').notNullable();

            table.string('status').notNullable().defaultTo('in_progress');
            table.string('trigger').notNullable();

            table
                .uuid('query_uuid')
                .nullable()
                .references('query_uuid')
                .inTable(QUERY_HISTORY_TABLE)
                .onDelete('SET NULL');

            table.timestamp('materialized_at', { useTz: false }).nullable();
            table.integer('row_count').nullable();
            table.jsonb('columns').nullable();
            table.text('error_message').nullable();

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );

    await knex.raw(`
        CREATE INDEX ${IDX_PROJECT_DEFINITION_STATUS}
        ON ${PRE_AGGREGATE_MATERIALIZATIONS_TABLE} (project_uuid, pre_aggregate_definition_uuid, status)
    `);

    await knex.raw(`
        CREATE INDEX ${IDX_PROJECT_STATUS}
        ON ${PRE_AGGREGATE_MATERIALIZATIONS_TABLE} (project_uuid, status)
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX ${IDX_ACTIVE_DEFINITION}
        ON ${PRE_AGGREGATE_MATERIALIZATIONS_TABLE} (pre_aggregate_definition_uuid)
        WHERE status = 'active'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ${IDX_ACTIVE_DEFINITION}`);
    await knex.raw(`DROP INDEX IF EXISTS ${IDX_PROJECT_STATUS}`);
    await knex.raw(`DROP INDEX IF EXISTS ${IDX_PROJECT_DEFINITION_STATUS}`);
    await knex.schema.dropTableIfExists(PRE_AGGREGATE_MATERIALIZATIONS_TABLE);
}
