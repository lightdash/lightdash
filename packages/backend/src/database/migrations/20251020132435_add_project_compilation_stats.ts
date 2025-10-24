import { Knex } from 'knex';

const PROJECT_COMPILE_LOG_TABLE = 'project_compile_log';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(PROJECT_COMPILE_LOG_TABLE))) {
        await knex.schema.createTable(PROJECT_COMPILE_LOG_TABLE, (table) => {
            table
                .uuid('project_compile_log_id')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('job_uuid')
                .nullable()
                .references('job_uuid')
                .inTable('jobs')
                .onDelete('SET NULL');

            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');

            table
                .uuid('user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');

            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.string('compilation_source').notNullable();
            table.string('dbt_connection_type').nullable();
            table.string('request_method').nullable();
            table.string('warehouse_type').nullable();

            table.jsonb('report').notNullable();

            table.index(['project_uuid', 'created_at']);
            table.index('job_uuid');
            table.index('created_at');
            table.index('report', undefined, 'gin');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PROJECT_COMPILE_LOG_TABLE);
}
