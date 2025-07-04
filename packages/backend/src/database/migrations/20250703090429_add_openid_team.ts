import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (table) => {
        table.string('team_id').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('openid_identities', (table) => {
        table.dropColumn('team_id');
    });
}
