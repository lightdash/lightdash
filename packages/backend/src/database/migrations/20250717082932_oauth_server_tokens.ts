import { Knex } from 'knex';

const OAUTH_CLIENTS_TABLE = 'oauth_clients';
const OAUTH_AUTHORIZATION_CODES_TABLE = 'oauth_authorization_codes';
const OAUTH_ACCESS_TOKENS_TABLE = 'oauth_access_tokens';
const OAUTH_REFRESH_TOKENS_TABLE = 'oauth_refresh_tokens';

export async function up(knex: Knex): Promise<void> {
    // Create OAuth authorization codes table
    await knex.schema.createTable(OAUTH_AUTHORIZATION_CODES_TABLE, (table) => {
        table
            .uuid('authorization_code_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table.string('authorization_code').notNullable().unique();
        table.timestamp('expires_at', { useTz: false }).notNullable();
        table.string('redirect_uri').notNullable();
        table.specificType('scopes', 'text[]').notNullable();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('used_at', { useTz: false }).nullable(); // When the code was used
        table.string('code_challenge').nullable(); // For PKCE
        table.string('code_challenge_method').nullable(); // 'S256' or 'plain'
    });

    // Create OAuth access tokens table
    await knex.schema.createTable(OAUTH_ACCESS_TOKENS_TABLE, (table) => {
        table
            .uuid('access_token_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table.string('access_token').notNullable().unique();
        table.timestamp('expires_at', { useTz: false }).notNullable();
        table.specificType('scopes', 'text[]').notNullable();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('last_used_at', { useTz: false }).nullable();
        table.timestamp('revoked_at', { useTz: false }).nullable();
        table
            .uuid('authorization_code_uuid')
            .nullable()
            .references('authorization_code_uuid')
            .inTable(OAUTH_AUTHORIZATION_CODES_TABLE)
            .onDelete('SET NULL');
    });

    // Create OAuth refresh tokens table
    await knex.schema.createTable(OAUTH_REFRESH_TOKENS_TABLE, (table) => {
        table
            .uuid('refresh_token_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));

        table.string('refresh_token').notNullable().unique();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.specificType('scopes', 'text[]').notNullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('last_used_at', { useTz: false }).nullable();
        table.timestamp('expires_at', { useTz: false }).notNullable();
        table.timestamp('revoked_at', { useTz: false }).nullable();
        table
            .uuid('access_token_uuid')
            .notNullable()
            .references('access_token_uuid')
            .inTable(OAUTH_ACCESS_TOKENS_TABLE)
            .onDelete('CASCADE');
    });

    // Create indexes for better performance
    await knex.schema.alterTable(OAUTH_AUTHORIZATION_CODES_TABLE, (table) => {
        table.index(['authorization_code'], 'oauth_auth_codes_code_idx');
        table.index(['expires_at'], 'oauth_auth_codes_expires_idx');
        table.index(['user_uuid'], 'oauth_auth_codes_user_idx');
        table.index(['organization_uuid'], 'oauth_auth_codes_org_idx');
    });

    await knex.schema.alterTable(OAUTH_ACCESS_TOKENS_TABLE, (table) => {
        table.index(['access_token'], 'oauth_access_tokens_token_idx');
        table.index(['expires_at'], 'oauth_access_tokens_expires_idx');
        table.index(['user_uuid'], 'oauth_access_tokens_user_idx');
        table.index(['organization_uuid'], 'oauth_access_tokens_org_idx');
        table.index(['revoked_at'], 'oauth_access_tokens_revoked_idx');
    });

    await knex.schema.alterTable(OAUTH_REFRESH_TOKENS_TABLE, (table) => {
        table.index(['refresh_token'], 'oauth_refresh_tokens_token_idx');
        table.index(['expires_at'], 'oauth_refresh_tokens_expires_idx');
        table.index(['user_uuid'], 'oauth_refresh_tokens_user_idx');
        table.index(['organization_uuid'], 'oauth_refresh_tokens_org_idx');
        table.index(['revoked_at'], 'oauth_refresh_tokens_revoked_idx');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OAUTH_REFRESH_TOKENS_TABLE);
    await knex.schema.dropTableIfExists(OAUTH_ACCESS_TOKENS_TABLE);
    await knex.schema.dropTableIfExists(OAUTH_AUTHORIZATION_CODES_TABLE);
}
