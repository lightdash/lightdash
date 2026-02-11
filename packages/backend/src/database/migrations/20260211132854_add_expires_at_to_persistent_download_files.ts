import { Knex } from 'knex';

const PersistentDownloadFilesTableName = 'persistent_download_files';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PersistentDownloadFilesTableName,
        (tableBuilder) => {
            tableBuilder
                .timestamp('expires_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.raw(`now() + interval '604800 seconds'`));
        },
    );

    await knex.raw(
        `UPDATE ${PersistentDownloadFilesTableName} SET expires_at = created_at + interval '604800 seconds'`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PersistentDownloadFilesTableName,
        (tableBuilder) => {
            tableBuilder.dropColumn('expires_at');
        },
    );
}
