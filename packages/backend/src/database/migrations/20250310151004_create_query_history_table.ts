import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const USERS_TABLE = 'users';
const PROJECTS_TABLE = 'projects';
const ORGANIZATIONS_TABLE = 'organizations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(QUERY_HISTORY_TABLE, (table) => {
        table
            .uuid('query_uuid')
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .notNullable()
            .primary();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL');

        table
            .uuid('project_uuid')
            .nullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('SET NULL');

        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(ORGANIZATIONS_TABLE)
            .onDelete('CASCADE');

        table.string('warehouse_query_id').nullable();
        table.string('context').notNullable();
        table.integer('default_page_size').notNullable();
        table.text('compiled_sql').notNullable();
        table.integer('warehouse_execution_time_ms').notNullable();
        table.jsonb('warehouse_query_metadata').nullable();
        table.integer('total_row_count').notNullable();
        table.jsonb('metric_query').notNullable();
        table.jsonb('fields').notNullable();
        table.jsonb('request_parameters').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(QUERY_HISTORY_TABLE);
}
