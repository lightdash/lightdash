import { Knex } from 'knex';

const PersistentDownloadFilesTableName = 'persistent_download_files';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(PersistentDownloadFilesTableName))) {
        await knex.schema.createTable(
            PersistentDownloadFilesTableName,
            (tableBuilder) => {
                tableBuilder.text('nanoid').primary();
                tableBuilder.text('s3_key').notNullable();
                tableBuilder.text('file_type').notNullable();
                tableBuilder
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable('organizations')
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('project_uuid')
                    .nullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('SET NULL');
                tableBuilder
                    .uuid('created_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
                tableBuilder
                    .timestamp('created_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder
                    .timestamp('expires_at', { useTz: true })
                    .notNullable()
                    .defaultTo(knex.raw(`now() + interval '604800 seconds'`));
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PersistentDownloadFilesTableName);
}
