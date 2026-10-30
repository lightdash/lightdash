import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds links and checks to the empty, unused credentials table, plus composite unique constraints on three populated identity parent tables. Existing primary keys guarantee uniqueness; no existing rows change.',
};

const purposeOwners = {
    shared_login: ['organization', 'connection'],
    ai_service_account: ['connection'],
    delivery_service_account: ['connection'],
    embed_service_account: ['connection'],
    automation_service_account: ['connection'],
    personal_sign_in: ['person'],
    agent_sign_in: ['person'],
    git_installation: ['organization'],
    git_user: ['person'],
    dbt_cloud: ['connection'],
    dbt_git: ['connection'],
    dbt_environment: ['connection'],
    external_source: ['connection'],
} as const;
const previousPurposeOwners = {
    ...purposeOwners,
    agent_oauth_client: ['organization'],
    ssh_key_pair: ['organization'],
} as const;
const warehousePurposes = [
    'shared_login',
    'ai_service_account',
    'delivery_service_account',
    'embed_service_account',
    'automation_service_account',
    'personal_sign_in',
    'agent_sign_in',
] as const;
const literals = (values: readonly string[]) =>
    values.map((value) => `'${value}'`).join(', ');
const ownerCheck = (owners: Record<string, readonly string[]>) =>
    Object.entries(owners)
        .map(
            ([purpose, kinds]) =>
                `(purpose = '${purpose}' AND owner_kind IN (${literals(kinds)}))`,
        )
        .join(' OR ');

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE ssh_key_pairs
            ADD CONSTRAINT ssh_key_pairs_organization_public_key_unique
                UNIQUE (organization_uuid, public_key);
        ALTER TABLE aws_web_identity_audiences
            ADD CONSTRAINT aws_web_identity_audiences_organization_audience_unique
                UNIQUE (organization_uuid, audience);
        ALTER TABLE organization_snowflake_agent_clients
            ADD CONSTRAINT snowflake_agent_clients_organization_client_unique
                UNIQUE (organization_uuid, organization_snowflake_agent_client_uuid);

        ALTER TABLE credentials
            DROP CONSTRAINT credentials_purpose_check,
            DROP CONSTRAINT credentials_check,
            DROP CONSTRAINT credentials_check5,
            DROP CONSTRAINT credentials_check1,
            ADD COLUMN ssh_key_pair_public_key text NULL,
            ADD COLUMN web_identity_audience text NULL,
            ADD COLUMN issuer_agent_client_uuid uuid NULL,
            ADD CONSTRAINT credentials_purpose_check
                CHECK (purpose IN (${literals(Object.keys(purposeOwners))})),
            ADD CONSTRAINT credentials_purpose_owner_check
                CHECK (${ownerCheck(purposeOwners)}),
            ADD CONSTRAINT credentials_warehouse_type_check
                CHECK ((purpose IN (${literals(warehousePurposes)})) = (warehouse_type IS NOT NULL)),
            ADD CONSTRAINT credentials_ssh_key_pair_purpose_check
                CHECK (ssh_key_pair_public_key IS NULL OR purpose = 'shared_login'),
            ADD CONSTRAINT credentials_web_identity_auth_check
                CHECK (web_identity_audience IS NULL OR (warehouse_type = 'athena' AND auth_mode = 'web_identity') IS TRUE),
            ADD CONSTRAINT credentials_agent_client_purpose_check
                CHECK ((purpose = 'agent_sign_in') = (issuer_agent_client_uuid IS NOT NULL)),
            ADD CONSTRAINT credentials_agent_client_warehouse_check
                CHECK (issuer_agent_client_uuid IS NULL OR warehouse_type = 'snowflake'),
            ADD CONSTRAINT credentials_issuer_credential_null_check
                CHECK (issuer_credential_uuid IS NULL),
            ADD CONSTRAINT credentials_ssh_key_pair_org_fk
                FOREIGN KEY (organization_uuid, ssh_key_pair_public_key)
                REFERENCES ssh_key_pairs (organization_uuid, public_key),
            ADD CONSTRAINT credentials_web_identity_audience_org_fk
                FOREIGN KEY (organization_uuid, web_identity_audience)
                REFERENCES aws_web_identity_audiences (organization_uuid, audience),
            ADD CONSTRAINT credentials_issuer_agent_client_org_fk
                FOREIGN KEY (organization_uuid, issuer_agent_client_uuid)
                REFERENCES organization_snowflake_agent_clients (organization_uuid, organization_snowflake_agent_client_uuid);

        CREATE UNIQUE INDEX credentials_ssh_key_pair_unique
            ON credentials (ssh_key_pair_public_key) WHERE ssh_key_pair_public_key IS NOT NULL;
        CREATE UNIQUE INDEX credentials_web_identity_audience_unique
            ON credentials (web_identity_audience) WHERE web_identity_audience IS NOT NULL;
        CREATE INDEX credentials_issuer_agent_client_fk ON credentials (issuer_agent_client_uuid);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        ALTER TABLE credentials
            DROP CONSTRAINT credentials_purpose_check,
            DROP CONSTRAINT credentials_purpose_owner_check,
            DROP CONSTRAINT credentials_warehouse_type_check,
            DROP CONSTRAINT credentials_ssh_key_pair_purpose_check,
            DROP CONSTRAINT credentials_web_identity_auth_check,
            DROP CONSTRAINT credentials_agent_client_purpose_check,
            DROP CONSTRAINT credentials_agent_client_warehouse_check,
            DROP CONSTRAINT credentials_issuer_credential_null_check,
            DROP COLUMN ssh_key_pair_public_key,
            DROP COLUMN web_identity_audience,
            DROP COLUMN issuer_agent_client_uuid,
            ADD CONSTRAINT credentials_purpose_check
                CHECK (purpose IN (${literals(Object.keys(previousPurposeOwners))})),
            ADD CONSTRAINT credentials_check
                CHECK (${ownerCheck(previousPurposeOwners)}),
            ADD CONSTRAINT credentials_check5
                CHECK ((purpose IN (${literals([...warehousePurposes, 'agent_oauth_client'])})) = (warehouse_type IS NOT NULL)),
            ADD CONSTRAINT credentials_check1
                CHECK (issuer_credential_uuid IS NULL OR purpose = 'agent_sign_in');

        ALTER TABLE ssh_key_pairs DROP CONSTRAINT ssh_key_pairs_organization_public_key_unique;
        ALTER TABLE aws_web_identity_audiences DROP CONSTRAINT aws_web_identity_audiences_organization_audience_unique;
        ALTER TABLE organization_snowflake_agent_clients DROP CONSTRAINT snowflake_agent_clients_organization_client_unique;
    `);
}
