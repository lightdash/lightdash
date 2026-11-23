import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: "Adds a column with a constant default and creates an empty table for viewers' sign-ins without touching existing data",
} as const;

const ExternalConnectionsTableName = 'external_connections';
const UserCredentialsTableName = 'external_connection_user_credentials';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    // 'shared': one sign-in answers everyone. 'per_user': each viewer queries
    // with their own sign-in, kept below.
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.text('sign_in_mode').notNullable().defaultTo('shared');
    });
    await knex.schema.createTable(UserCredentialsTableName, (table) => {
        // Its own key, so secret rotation can re-encrypt rows one by one
        table
            .uuid('external_connection_user_credential_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('external_connection_uuid')
            .notNullable()
            .references('external_connection_uuid')
            .inTable(ExternalConnectionsTableName)
            .onDelete('CASCADE');
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.binary('encrypted_payload').notNullable();
        // When the viewer last connected an account; refreshes leave it be
        table
            .timestamp('signed_in_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['external_connection_uuid', 'user_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(UserCredentialsTableName);
    await knex.schema.alterTable(ExternalConnectionsTableName, (table) => {
        table.dropColumn('sign_in_mode');
    });
}
