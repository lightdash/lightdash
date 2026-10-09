import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds connection credential slots without changing existing tables.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        CREATE TABLE ai_service_account_credentials (
            ai_service_account_credential_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            identity_uuid uuid NOT NULL DEFAULT uuid_generate_v4(),
            project_uuid uuid NOT NULL REFERENCES projects(project_uuid) ON DELETE CASCADE,
            warehouse_connection_uuid uuid NULL REFERENCES warehouse_connections(warehouse_connection_uuid) ON DELETE CASCADE,
            kind text NOT NULL DEFAULT 'ai_service_account' CHECK (kind = 'ai_service_account'),
            scope text NOT NULL DEFAULT 'connection' CHECK (scope = 'connection'),
            created_by_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            updated_by_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            credential_subject_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            warehouse_type varchar(255) NOT NULL REFERENCES warehouse_types(warehouse_type),
            authentication_method text NOT NULL CHECK (authentication_method IN
                ('password','private_key','oauth_m2m','iam','access_key','iam_role','web_identity','token')),
            encrypted_credentials bytea NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            FOREIGN KEY (project_uuid, warehouse_connection_uuid)
                REFERENCES warehouse_connections(project_uuid, warehouse_connection_uuid) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX ai_service_account_original_slot
            ON ai_service_account_credentials(project_uuid) WHERE warehouse_connection_uuid IS NULL;
        CREATE UNIQUE INDEX ai_service_account_extra_slot
            ON ai_service_account_credentials(project_uuid, warehouse_connection_uuid) WHERE warehouse_connection_uuid IS NOT NULL;
        CREATE UNIQUE INDEX ai_service_account_identity_uuid ON ai_service_account_credentials(identity_uuid);
        CREATE INDEX ai_service_account_project_fk ON ai_service_account_credentials(project_uuid);
        CREATE INDEX ai_service_account_connection_fk ON ai_service_account_credentials(warehouse_connection_uuid);
        CREATE INDEX ai_service_account_creator_fk ON ai_service_account_credentials(created_by_user_uuid);
        CREATE INDEX ai_service_account_updater_fk ON ai_service_account_credentials(updated_by_user_uuid);
        CREATE INDEX ai_service_account_subject_fk ON ai_service_account_credentials(credential_subject_user_uuid);
        CREATE INDEX ai_service_account_warehouse_type_fk ON ai_service_account_credentials(warehouse_type);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_service_account_credentials');
}
