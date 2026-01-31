import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        // source: 'yaml' for YAML-defined edges, 'ui' for UI-created edges
        table
            .string('source')
            .notNullable()
            .defaultTo('ui')
            .comment('Source of the edge: yaml or ui');
    });
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.index(['project_uuid', 'source']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.dropIndex(['project_uuid', 'source']);
        table.dropColumn('source');
    });
}
