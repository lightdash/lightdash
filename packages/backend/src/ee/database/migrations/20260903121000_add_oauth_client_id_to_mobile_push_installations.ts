import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable oauth_client_id column that existing installations leave empty',
} as const;

const installationsTable = 'mobile_push_installations';
const oauthClientForeign = 'mobile_push_installations_oauth_client_id_foreign';
const oauthClientIndex = 'mobile_push_installations_oauth_client_id_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(installationsTable, (table) => {
        table
            .text('oauth_client_id')
            .nullable()
            .references('client_id')
            .inTable('oauth2_clients')
            .onDelete('CASCADE')
            .withKeyName(oauthClientForeign)
            .index(oauthClientIndex);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(installationsTable, (table) => {
        table.dropColumn('oauth_client_id');
    });
}
