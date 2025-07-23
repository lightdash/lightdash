import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS oauth2_clients (
            client_id VARCHAR(255) PRIMARY KEY,
            client_secret VARCHAR(255),
            redirect_uris TEXT[] NOT NULL,
            grants TEXT[] NOT NULL DEFAULT ARRAY['authorization_code'],
            scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write'],
            client_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS oauth2_authorization_codes (
            authorization_code VARCHAR(255) PRIMARY KEY,
            expires_at TIMESTAMP NOT NULL,
            redirect_uri TEXT NOT NULL,
            scope TEXT[],
            client_id VARCHAR(255) NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            code_challenge VARCHAR(255),
            code_challenge_method VARCHAR(10),
            organization_uuid UUID NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS oauth2_access_tokens (
            access_token VARCHAR(255) PRIMARY KEY,
            expires_at TIMESTAMP NOT NULL,
            scope TEXT[],
            client_id VARCHAR(255) NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            organization_uuid UUID NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS oauth2_refresh_tokens (
            refresh_token VARCHAR(255) PRIMARY KEY,
            expires_at TIMESTAMP NOT NULL,
            scope TEXT[],
            client_id VARCHAR(255) NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            organization_uuid UUID NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS oauth2_authorization_codes_client_id_idx ON oauth2_authorization_codes(client_id);
        CREATE INDEX IF NOT EXISTS oauth2_authorization_codes_user_id_idx ON oauth2_authorization_codes(user_id);
        CREATE INDEX IF NOT EXISTS oauth2_authorization_codes_expires_at_idx ON oauth2_authorization_codes(expires_at);
        
        CREATE INDEX IF NOT EXISTS oauth2_access_tokens_client_id_idx ON oauth2_access_tokens(client_id);
        CREATE INDEX IF NOT EXISTS oauth2_access_tokens_user_id_idx ON oauth2_access_tokens(user_id);
        CREATE INDEX IF NOT EXISTS oauth2_access_tokens_expires_at_idx ON oauth2_access_tokens(expires_at);
        
        CREATE INDEX IF NOT EXISTS oauth2_refresh_tokens_client_id_idx ON oauth2_refresh_tokens(client_id);
        CREATE INDEX IF NOT EXISTS oauth2_refresh_tokens_user_id_idx ON oauth2_refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS oauth2_refresh_tokens_expires_at_idx ON oauth2_refresh_tokens(expires_at);

        INSERT INTO oauth2_clients (client_id, client_secret, redirect_uris, grants, scopes, client_name) 
        VALUES (
            'lightdash-cli',
            null,
            ARRAY['http://localhost:*/callback'],
            ARRAY['authorization_code', 'refresh_token', 'client_credentials'],
            ARRAY['read', 'write'],
            'Lightdash CLI'
        );
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DROP INDEX IF EXISTS oauth2_refresh_tokens_expires_at_idx;
        DROP INDEX IF EXISTS oauth2_refresh_tokens_user_id_idx;
        DROP INDEX IF EXISTS oauth2_refresh_tokens_client_id_idx;
        
        DROP INDEX IF EXISTS oauth2_access_tokens_expires_at_idx;
        DROP INDEX IF EXISTS oauth2_access_tokens_user_id_idx;
        DROP INDEX IF EXISTS oauth2_access_tokens_client_id_idx;
        
        DROP INDEX IF EXISTS oauth2_authorization_codes_expires_at_idx;
        DROP INDEX IF EXISTS oauth2_authorization_codes_user_id_idx;
        DROP INDEX IF EXISTS oauth2_authorization_codes_client_id_idx;
        
        DROP TABLE IF EXISTS oauth2_refresh_tokens CASCADE;
        DROP TABLE IF EXISTS oauth2_access_tokens CASCADE;
        DROP TABLE IF EXISTS oauth2_authorization_codes CASCADE;
        DROP TABLE IF EXISTS oauth2_clients CASCADE;
        ALTER TABLE IF EXISTS oauth2_access_tokens DROP COLUMN IF EXISTS organization_uuid;
    `);
}
