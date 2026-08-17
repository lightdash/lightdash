import { Knex } from 'knex';

const QUERY_DAGS_TABLE = 'query_dags';
const QUERY_DAG_NODES_TABLE = 'query_dag_nodes';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(QUERY_DAGS_TABLE, (table) => {
        table
            .uuid('query_dag_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.text('status').notNullable();
        table.text('error').nullable();
        table.text('context').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(QUERY_DAG_NODES_TABLE, (table) => {
        table
            .uuid('query_dag_node_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('query_dag_uuid')
            .notNullable()
            .references('query_dag_uuid')
            .inTable(QUERY_DAGS_TABLE)
            .onDelete('CASCADE')
            .index();
        table.text('node_id').notNullable();
        table.text('source_type').notNullable();
        table.jsonb('query').notNullable();
        table
            .specificType('depends_on', 'text[]')
            .notNullable()
            .defaultTo(knex.raw("'{}'::text[]"));
        table.text('status').notNullable();
        table
            .uuid('query_uuid')
            .nullable()
            .references('query_uuid')
            .inTable('query_history')
            .onDelete('SET NULL')
            .index();
        table.text('error').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['query_dag_uuid', 'node_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(QUERY_DAG_NODES_TABLE);
    await knex.schema.dropTableIfExists(QUERY_DAGS_TABLE);
}
