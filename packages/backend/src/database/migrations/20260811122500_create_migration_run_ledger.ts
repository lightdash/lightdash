import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'adds nullable live migration state and an independent history table using idempotent additive DDL without rewriting existing rows',
} as const;

export const MIGRATION_RUN_LEDGER_SCHEMA_SQL = `
ALTER TABLE migration_lease
    ADD COLUMN IF NOT EXISTS last_unlock_forced boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS parked_at timestamptz,
    ADD COLUMN IF NOT EXISTS parked_app_version text,
    ADD COLUMN IF NOT EXISTS parked_migration text,
    ADD COLUMN IF NOT EXISTS parked_error text,
    ADD COLUMN IF NOT EXISTS parked_run_uuid uuid;

CREATE TABLE IF NOT EXISTS migration_run_ledger (
    migration_run_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_token uuid NOT NULL,
    holder_hostname text NOT NULL,
    holder_pod_name text,
    app_version text NOT NULL,
    from_migration text,
    to_migration text,
    attempt integer NOT NULL,
    started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at timestamptz,
    outcome text NOT NULL,
    failing_migration text,
    failure_detail text,
    last_unlocked_by text,
    last_unlocked_at timestamptz,
    last_unlock_forced boolean NOT NULL DEFAULT false,
    CONSTRAINT migration_run_ledger_attempt_positive CHECK (attempt > 0),
    CONSTRAINT migration_run_ledger_outcome_check CHECK (outcome IN ('running', 'succeeded', 'retrying', 'parked'))
);

CREATE INDEX IF NOT EXISTS migration_run_ledger_started_at_idx
    ON migration_run_ledger (started_at DESC);
`;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(MIGRATION_RUN_LEDGER_SCHEMA_SQL);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
DROP TABLE IF EXISTS migration_run_ledger;

ALTER TABLE migration_lease
    DROP COLUMN IF EXISTS parked_run_uuid,
    DROP COLUMN IF EXISTS parked_error,
    DROP COLUMN IF EXISTS parked_migration,
    DROP COLUMN IF EXISTS parked_app_version,
    DROP COLUMN IF EXISTS parked_at,
    DROP COLUMN IF EXISTS last_unlock_forced;
`);
}
