import { Knex } from 'knex';

const TABLE_NAME = 'persistent_download_files';
const CONSTRAINT_NAME = 'persistent_download_files_access_mode_check';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.text('access_mode').notNullable().defaultTo('legacy_public');
    });

    await knex.raw(`
        ALTER TABLE ${TABLE_NAME}
            ADD CONSTRAINT ${CONSTRAINT_NAME}
                CHECK (access_mode IN (
                    'authenticated_creator',
                    'authenticated_project',
                    'signed',
                    'legacy_public'
                )),
            ALTER COLUMN access_mode SET DEFAULT 'authenticated_creator'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${TABLE_NAME}
            DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
    `);

    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn('access_mode');
    });
}
