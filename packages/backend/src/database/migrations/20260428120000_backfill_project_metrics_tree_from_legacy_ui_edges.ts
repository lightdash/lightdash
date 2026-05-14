import { Knex } from 'knex';

const METRICS_TREES_TABLE = 'metrics_trees';
const METRICS_TREE_NODES_TABLE = 'metrics_tree_nodes';
const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';

const TREE_NAME = 'Project Metrics';
const TREE_SLUG = 'project-metrics';

// Migrates legacy single-tree canvas view to new saved trees format
export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `
        WITH eligible_projects AS (
            SELECT DISTINCT e.project_uuid
            FROM ${METRICS_TREE_EDGES_TABLE} e
            WHERE e.source = 'ui'
              AND NOT EXISTS (
                  SELECT 1
                  FROM ${METRICS_TREES_TABLE} t
                  WHERE t.project_uuid = e.project_uuid
              )
        ),
        inserted_trees AS (
            INSERT INTO ${METRICS_TREES_TABLE}
                (project_uuid, slug, name, source)
            SELECT project_uuid, :slug, :name, 'ui'
            FROM eligible_projects
            RETURNING metrics_tree_uuid, project_uuid
        ),
        edge_metrics AS (
            SELECT it.metrics_tree_uuid,
                   e.source_metric_catalog_search_uuid AS catalog_search_uuid
            FROM inserted_trees it
            JOIN ${METRICS_TREE_EDGES_TABLE} e
              ON e.project_uuid = it.project_uuid AND e.source = 'ui'
            UNION
            SELECT it.metrics_tree_uuid,
                   e.target_metric_catalog_search_uuid
            FROM inserted_trees it
            JOIN ${METRICS_TREE_EDGES_TABLE} e
              ON e.project_uuid = it.project_uuid AND e.source = 'ui'
        )
        INSERT INTO ${METRICS_TREE_NODES_TABLE}
            (metrics_tree_uuid, catalog_search_uuid, source)
        SELECT metrics_tree_uuid, catalog_search_uuid, 'ui'
        FROM edge_metrics
        ON CONFLICT (metrics_tree_uuid, catalog_search_uuid) DO NOTHING
        `,
        { slug: TREE_SLUG, name: TREE_NAME },
    );
}

export async function down(_knex: Knex): Promise<void> {
    // no-op
}
