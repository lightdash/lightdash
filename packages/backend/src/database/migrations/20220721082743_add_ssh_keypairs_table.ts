import { Knex } from 'knex';

const TABLE_NAME = 'ssh_keypairs';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(TABLE_NAME))) {
        await knex.schema.createTable(TABLE_NAME, (tableBuilder) => {
            tableBuilder.text('public_key').primary();
            tableBuilder.binary('encrypted_private_key').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(TABLE_NAME);
}
