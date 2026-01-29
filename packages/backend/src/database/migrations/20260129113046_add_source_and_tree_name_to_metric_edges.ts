import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.string('source').defaultTo('ui').notNullable();
        table.string('tree_name').nullable();
        table.index(['project_uuid', 'source']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.dropIndex(['project_uuid', 'source']);
        table.dropColumn('tree_name');
        table.dropColumn('source');
    });
}
