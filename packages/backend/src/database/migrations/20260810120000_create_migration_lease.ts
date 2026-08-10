import { type Knex } from 'knex';

export const MIGRATION_LEASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS migration_lease (
    lease_key text PRIMARY KEY,
    holder_hostname text,
    holder_pod_name text,
    app_version text,
    claim_token uuid,
    started_at timestamptz,
    current_migration text,
    last_heartbeat timestamptz,
    last_unlocked_by text,
    last_unlocked_at timestamptz,
    CONSTRAINT migration_lease_singleton_key CHECK (lease_key = 'global')
);

INSERT INTO migration_lease (lease_key)
VALUES ('global')
ON CONFLICT (lease_key) DO NOTHING;
`;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(MIGRATION_LEASE_SCHEMA_SQL);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('migration_lease');
}
