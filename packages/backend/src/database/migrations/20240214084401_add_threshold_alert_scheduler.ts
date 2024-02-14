import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.jsonb('threshold').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('scheduler', (t) => {
        t.dropColumns('threshold');
    });
}
