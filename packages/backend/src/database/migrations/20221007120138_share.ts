import { Knex } from 'knex';

const SHARE_TABLE_NAME = 'share';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(SHARE_TABLE_NAME, (tableBuilder) => {
        tableBuilder.specificType(
            'share_id',
            'INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
        );
        tableBuilder.text('nanoid').notNullable();
        tableBuilder.text('path').notNullable();
        tableBuilder.text('params').notNullable();
        tableBuilder.unique(['nanoid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SHARE_TABLE_NAME);
}
