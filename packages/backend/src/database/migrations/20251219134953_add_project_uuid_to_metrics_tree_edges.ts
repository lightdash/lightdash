import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';
const PROJECTS_TABLE_NAME = 'projects';
const TRIGGER_NAME = 'set_metrics_tree_edge_project_uuid';
const FUNCTION_NAME = 'set_metrics_tree_edge_project_uuid_fn';

export async function up(knex: Knex): Promise<void> {
    // 1. Add nullable project_uuid column with index
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.uuid('project_uuid').nullable();
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable(PROJECTS_TABLE_NAME)
            .onDelete('CASCADE');
        table.index('project_uuid');
    });

    // 2. Backfill project_uuid from the source metric's catalog_search entry
    await knex(METRICS_TREE_EDGES_TABLE).update({
        // @ts-ignore
        project_uuid: knex(CATALOG_SEARCH_TABLE)
            .select('project_uuid')
            .where(
                'catalog_search_uuid',
                knex.ref('source_metric_catalog_search_uuid'),
            ),
    });

    // 3. Create trigger function to auto-populate project_uuid on insert
    // This ensures backwards compatibility with old code that doesn't set project_uuid
    await knex.raw(`
        CREATE OR REPLACE FUNCTION ${FUNCTION_NAME}()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.project_uuid IS NULL THEN
                SELECT project_uuid INTO NEW.project_uuid
                FROM ${CATALOG_SEARCH_TABLE}
                WHERE catalog_search_uuid = NEW.source_metric_catalog_search_uuid;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    // 4. Create trigger that runs before insert
    await knex.raw(`
        CREATE TRIGGER ${TRIGGER_NAME}
        BEFORE INSERT ON ${METRICS_TREE_EDGES_TABLE}
        FOR EACH ROW
        EXECUTE FUNCTION ${FUNCTION_NAME}();
    `);

    // 5. Make project_uuid not nullable
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.uuid('project_uuid').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop trigger and function first
    await knex.raw(
        `DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON ${METRICS_TREE_EDGES_TABLE}`,
    );
    await knex.raw(`DROP FUNCTION IF EXISTS ${FUNCTION_NAME}()`);

    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.dropColumn('project_uuid');
    });
}
