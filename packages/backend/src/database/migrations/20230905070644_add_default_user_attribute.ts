import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('user_attributes', (t) => {
        t.text('attribute_default').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('user_attributes', (t) => {
        t.dropColumns('attribute_default');
    });
}
