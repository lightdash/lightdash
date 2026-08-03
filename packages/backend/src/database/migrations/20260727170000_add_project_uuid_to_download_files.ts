import { Knex } from 'knex';

const DownloadFilesTableName = 'download_files';

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasColumn(DownloadFilesTableName, 'project_uuid'))
    ) {
        await knex.schema.alterTable(DownloadFilesTableName, (table) => {
            table
                .uuid('project_uuid')
                .nullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(DownloadFilesTableName, 'project_uuid')) {
        await knex.schema.alterTable(DownloadFilesTableName, (table) => {
            table.dropColumn('project_uuid');
        });
    }
}
