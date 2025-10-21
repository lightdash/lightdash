import { Knex } from 'knex';

const DOWNLOAD_AUDIT_TABLE_NAME = 'download_audit';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(DOWNLOAD_AUDIT_TABLE_NAME))) {
        await knex.schema.createTable(DOWNLOAD_AUDIT_TABLE_NAME, (table) => {
            table.increments('download_audit_id').primary();
            table
                .uuid('download_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .unique();
            table.uuid('query_uuid').notNullable();
            table.uuid('user_uuid').nullable();
            table.uuid('organization_uuid').notNullable();
            table.uuid('project_uuid').nullable();
            table.text('file_type').notNullable();
            table
                .timestamp('downloaded_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.text('original_query_context');

            // Indexes for common queries
            table.index('user_uuid', 'download_audit_user_uuid_idx');
            table.index(
                'organization_uuid',
                'download_audit_organization_uuid_idx',
            );
            table.index('downloaded_at', 'download_audit_downloaded_at_idx');
            table.index('query_uuid', 'download_audit_query_uuid_idx');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(DOWNLOAD_AUDIT_TABLE_NAME);
}
