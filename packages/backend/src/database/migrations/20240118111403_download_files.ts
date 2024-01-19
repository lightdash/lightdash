import { Knex } from 'knex';

const downloadFilesTableName = 'download_files';
export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(downloadFilesTableName))) {
        await knex.schema.createTable(
            downloadFilesTableName,
            (tableBuilder) => {
                tableBuilder.text('nanoid').notNullable();
                tableBuilder.text('path').notNullable();
                tableBuilder.text('type').notNullable();
                tableBuilder
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                tableBuilder.unique(['nanoid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(downloadFilesTableName);
}
