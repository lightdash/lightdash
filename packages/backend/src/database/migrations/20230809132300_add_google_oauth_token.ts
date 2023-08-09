import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (t) => {
        t.string('refresh_token').nullable();
        t.string('scope').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (t) => {
        t.dropColumns('refresh_token');
        t.dropColumns('scope');
    });
}
