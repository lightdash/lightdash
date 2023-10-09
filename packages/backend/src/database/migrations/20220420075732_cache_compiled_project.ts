import { Knex } from 'knex';

const CACHED_EXPLORES_TABLE_NAME = 'cached_explores';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CACHED_EXPLORES_TABLE_NAME))) {
        await knex.schema.createTable(
            CACHED_EXPLORES_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.uuid('project_uuid').primary().notNullable();
                tableBuilder.jsonb('explores').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CACHED_EXPLORES_TABLE_NAME);
}
