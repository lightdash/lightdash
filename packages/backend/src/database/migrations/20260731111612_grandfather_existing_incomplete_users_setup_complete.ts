import { type Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('users')
        .where('is_setup_complete', false)
        .where('created_at', '<', knex.raw('NOW() - interval 1 day'))
        .update({ is_setup_complete: true });
}

export async function down(_knex: Knex): Promise<void> {
    // no-op
}
