import { Knex } from 'knex';

const CACHED_EXPLORES_TABLE_NAME = 'cached_explores';

export async function up(knex: Knex): Promise<void> {
    // delete all rows where the project doesn't exist before applying foreign key
    await knex(CACHED_EXPLORES_TABLE_NAME)
        .whereNotExists(
            knex('projects')
                .select('project_id')
                .whereRaw(
                    'projects.project_uuid = cached_explores.project_uuid',
                ),
        )
        .delete();

    if (await knex.schema.hasTable(CACHED_EXPLORES_TABLE_NAME)) {
        await knex.schema.alterTable(CACHED_EXPLORES_TABLE_NAME, (table) => {
            table
                .foreign('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(CACHED_EXPLORES_TABLE_NAME)) {
        await knex.schema.alterTable(CACHED_EXPLORES_TABLE_NAME, (table) => {
            table.dropForeign('project_uuid');
        });
    }
}
