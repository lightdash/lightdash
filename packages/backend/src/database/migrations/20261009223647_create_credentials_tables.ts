import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds credential storage and binding tables without changing existing data or columns.',
};

const purposeOwners = {
    shared_login: ['organization', 'connection'],
    ai_service_account: ['connection'],
    delivery_service_account: ['connection'],
    embed_service_account: ['connection'],
    automation_service_account: ['connection'],
    personal_sign_in: ['person'],
    agent_sign_in: ['person'],
    agent_oauth_client: ['organization'],
    ssh_key_pair: ['organization'],
    git_installation: ['organization'],
    git_user: ['person'],
    dbt_cloud: ['connection'],
    dbt_git: ['connection'],
    dbt_environment: ['connection'],
    external_source: ['connection'],
} as const;
const ownerKinds = ['organization', 'connection', 'person'] as const;
const slots = [
    'shared_login',
    'ai_service_account',
    'delivery_service_account',
    'embed_service_account',
    'automation_service_account',
    'personal_sign_in',
    'agent_sign_in',
] as const;
const warehousePurposes = [...slots, 'agent_oauth_client'] as const;
const literals = (values: readonly string[]) =>
    values.map((value) => `'${value}'`).join(', ');

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        CREATE TABLE credentials (
            credential_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            organization_uuid uuid NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            owner_kind text NOT NULL CHECK (owner_kind IN (${literals(ownerKinds)})),
            owner_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
            owner_project_uuid uuid NULL REFERENCES projects(project_uuid) ON DELETE CASCADE,
            owner_warehouse_connection_uuid uuid NULL REFERENCES warehouse_connections(warehouse_connection_uuid) ON DELETE CASCADE,
            purpose text NOT NULL CHECK (purpose IN (${literals(Object.keys(purposeOwners))})),
            warehouse_type varchar(255) NULL REFERENCES warehouse_types(warehouse_type),
            auth_mode text NOT NULL,
            identity jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(identity) = 'object'),
            encrypted_secrets bytea NOT NULL,
            subject_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            subject_label text NULL,
            issuer_credential_uuid uuid NULL REFERENCES credentials(credential_uuid) ON DELETE CASCADE,
            oauth_grant_uuid uuid NULL REFERENCES user_oauth_grants(user_oauth_grant_uuid) ON DELETE CASCADE,
            generation uuid NOT NULL DEFAULT uuid_generate_v4(),
            expires_at timestamptz NULL,
            rotated_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            created_by_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            updated_by_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            source_table text NULL,
            source_key text NULL,
            source_fingerprint text NULL,
            CHECK (${Object.entries(purposeOwners)
                .map(
                    ([purpose, owners]) =>
                        `(purpose = '${purpose}' AND owner_kind IN (${literals(owners)}))`,
                )
                .join(' OR ')}),
            FOREIGN KEY (owner_project_uuid, owner_warehouse_connection_uuid) REFERENCES warehouse_connections(project_uuid, warehouse_connection_uuid) MATCH SIMPLE ON DELETE CASCADE,
            CHECK (issuer_credential_uuid IS NULL OR purpose = 'agent_sign_in'),
            CHECK ((owner_kind = 'person') = (owner_user_uuid IS NOT NULL)),
            CHECK ((owner_kind = 'connection') = (owner_project_uuid IS NOT NULL)),
            CHECK (owner_warehouse_connection_uuid IS NULL OR owner_kind = 'connection'),
            CHECK ((purpose IN (${literals(warehousePurposes)})) = (warehouse_type IS NOT NULL)),
            CHECK ((source_table IS NULL AND source_key IS NULL AND source_fingerprint IS NULL)
                OR (source_table IS NOT NULL AND source_key IS NOT NULL)),
            UNIQUE (credential_uuid, owner_user_uuid),
            UNIQUE (credential_uuid, purpose)
        );
        CREATE UNIQUE INDEX credentials_source_unique ON credentials(source_table, source_key) WHERE source_table IS NOT NULL;
        CREATE INDEX credentials_organization_fk ON credentials(organization_uuid);
        CREATE INDEX credentials_owner_user_fk ON credentials(owner_user_uuid);
        CREATE INDEX credentials_owner_project_fk ON credentials(owner_project_uuid);
        CREATE INDEX credentials_owner_connection_fk ON credentials(owner_warehouse_connection_uuid);
        CREATE INDEX credentials_subject_user_fk ON credentials(subject_user_uuid);
        CREATE INDEX credentials_issuer_fk ON credentials(issuer_credential_uuid);
        CREATE INDEX credentials_oauth_grant_fk ON credentials(oauth_grant_uuid);
        CREATE INDEX credentials_creator_fk ON credentials(created_by_user_uuid);
        CREATE INDEX credentials_updater_fk ON credentials(updated_by_user_uuid);
        CREATE INDEX credentials_warehouse_type_fk ON credentials(warehouse_type);

        CREATE TABLE credential_token_state (
            credential_uuid uuid PRIMARY KEY REFERENCES credentials(credential_uuid) ON DELETE CASCADE,
            encrypted_refresh_token bytea NULL,
            refresh_expires_at timestamptz NULL,
            version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
            rotated_at timestamptz NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE credential_bindings (
            credential_binding_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            project_uuid uuid NOT NULL REFERENCES projects(project_uuid) ON DELETE CASCADE,
            warehouse_connection_uuid uuid NULL REFERENCES warehouse_connections(warehouse_connection_uuid) ON DELETE CASCADE,
            slot text NOT NULL CHECK (slot IN (${literals(slots)})),
            user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
            credential_uuid uuid NOT NULL REFERENCES credentials(credential_uuid) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            created_by_user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE SET NULL,
            FOREIGN KEY (credential_uuid, user_uuid) REFERENCES credentials(credential_uuid, owner_user_uuid) ON DELETE CASCADE,
            FOREIGN KEY (credential_uuid, slot) REFERENCES credentials(credential_uuid, purpose) ON DELETE CASCADE,
            FOREIGN KEY (project_uuid, warehouse_connection_uuid) REFERENCES warehouse_connections(project_uuid, warehouse_connection_uuid) ON DELETE CASCADE,
            CHECK ((slot IN ('personal_sign_in', 'agent_sign_in')) = (user_uuid IS NOT NULL))
        );
        CREATE UNIQUE INDEX credential_bindings_original_service_unique ON credential_bindings(project_uuid, slot)
            WHERE warehouse_connection_uuid IS NULL AND user_uuid IS NULL;
        CREATE UNIQUE INDEX credential_bindings_extra_service_unique ON credential_bindings(project_uuid, warehouse_connection_uuid, slot)
            WHERE warehouse_connection_uuid IS NOT NULL AND user_uuid IS NULL;
        CREATE UNIQUE INDEX credential_bindings_original_person_unique ON credential_bindings(project_uuid, slot, user_uuid)
            WHERE warehouse_connection_uuid IS NULL AND user_uuid IS NOT NULL;
        CREATE UNIQUE INDEX credential_bindings_extra_person_unique ON credential_bindings(project_uuid, warehouse_connection_uuid, slot, user_uuid)
            WHERE warehouse_connection_uuid IS NOT NULL AND user_uuid IS NOT NULL;
        CREATE INDEX credential_bindings_project_fk ON credential_bindings(project_uuid);
        CREATE INDEX credential_bindings_connection_fk ON credential_bindings(warehouse_connection_uuid);
        CREATE INDEX credential_bindings_user_fk ON credential_bindings(user_uuid);
        CREATE INDEX credential_bindings_credential_fk ON credential_bindings(credential_uuid);
        CREATE INDEX credential_bindings_creator_fk ON credential_bindings(created_by_user_uuid);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('credential_bindings');
    await knex.schema.dropTable('credential_token_state');
    await knex.schema.dropTable('credentials');
}
