import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (t) => {
        t.text('refresh_token').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (t) => {
        t.dropColumns('refresh_token');
    });
}
