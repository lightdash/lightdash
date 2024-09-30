import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('ssh_key_pairs'))) {
        await knex.schema.createTable('ssh_key_pairs', (table) => {
            table.text('public_key').primary();
            table.binary('private_key').notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('ssh_key_pairs');
}
