import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.boolean('enabled').defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.dropColumns('enabled');
    });
}
