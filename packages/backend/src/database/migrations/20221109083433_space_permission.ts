import { Knex } from 'knex';

const SPACE_SHARE_TABLE = 'space_share';
const SHARE_TABLE = 'spaces';
const isPrivateColumnName = 'is_private';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(SHARE_TABLE, (table) => {
        table.boolean(isPrivateColumnName).defaultTo(false);
    });

    await knex.schema.createTable(SPACE_SHARE_TABLE, (tableBuilder) => {
        tableBuilder
            .integer('user_id')
            .notNullable()
            .references('user_id')
            .inTable('users')
            .onDelete('CASCADE');
        tableBuilder
            .integer('space_id')
            .notNullable()
            .references('space_id')
            .inTable(SHARE_TABLE)
            .onDelete('CASCADE');
        tableBuilder.unique(['user_id', 'space_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SHARE_TABLE, isPrivateColumnName)) {
        await knex.schema.table(SHARE_TABLE, (table) => {
            table.dropColumn(isPrivateColumnName);
        });
    }

    await knex.schema.dropTableIfExists(SPACE_SHARE_TABLE);
}
