import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';
const TRIGGER_NAME = 'set_metrics_tree_edge_project_uuid';
const FUNCTION_NAME = 'set_metrics_tree_edge_project_uuid_fn';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON ${METRICS_TREE_EDGES_TABLE}`,
    );
    await knex.raw(`DROP FUNCTION IF EXISTS ${FUNCTION_NAME}()`);
}

export async function down(knex: Knex): Promise<void> {
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

    await knex.raw(`
        CREATE TRIGGER ${TRIGGER_NAME}
        BEFORE INSERT ON ${METRICS_TREE_EDGES_TABLE}
        FOR EACH ROW
        EXECUTE FUNCTION ${FUNCTION_NAME}();
    `);
}
