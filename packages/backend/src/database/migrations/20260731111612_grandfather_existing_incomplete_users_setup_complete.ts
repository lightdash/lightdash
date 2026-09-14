import { type Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('users')
        .where('is_setup_complete', false)
        .update({ is_setup_complete: true });
}

export async function down(_knex: Knex): Promise<void> {
    // no-op
}
