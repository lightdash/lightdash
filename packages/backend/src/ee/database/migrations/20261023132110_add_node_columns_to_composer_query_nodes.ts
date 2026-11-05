import { Knex } from 'knex';

const TableName = 'composer_query_nodes';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable node_columns column to composer_query_nodes; existing rows and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TableName, (table) => {
            table.jsonb('node_columns').nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(TableName, (table) => {
            table.dropColumn('node_columns');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
