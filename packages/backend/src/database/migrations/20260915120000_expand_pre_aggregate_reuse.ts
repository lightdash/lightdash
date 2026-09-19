import { Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds nullable provenance and logical identity while preserving existing cache cascades and disabling reuse.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.raw(`
            ALTER TABLE pre_aggregate_definitions
                ADD COLUMN IF NOT EXISTS source_explore_name text,
                ADD COLUMN IF NOT EXISTS pre_aggregate_name text,
                ADD COLUMN IF NOT EXISTS publication_version uuid,
                ADD COLUMN IF NOT EXISTS compatibility_hash varchar(64),
                ADD COLUMN IF NOT EXISTS schedule_revision uuid,
                ADD COLUMN IF NOT EXISTS scheduler_timezone text,
                ADD COLUMN IF NOT EXISTS physical_output_contract jsonb,
                ADD COLUMN IF NOT EXISTS preparation_status text NOT NULL DEFAULT 'unverified'
                    CHECK (preparation_status IN ('ready', 'unverified', 'invalid')),
                ADD COLUMN IF NOT EXISTS automatic_eligible boolean NOT NULL DEFAULT false
        `);
        await knex.raw(`
            ALTER TABLE pre_aggregate_definitions
                ALTER COLUMN publication_version SET DEFAULT uuid_generate_v4(),
                ALTER COLUMN schedule_revision SET DEFAULT uuid_generate_v4()
        `);
        await knex.raw(`
            ALTER TABLE pre_aggregate_materializations
                ADD COLUMN IF NOT EXISTS publication_version uuid,
                ADD COLUMN IF NOT EXISTS schedule_revision uuid,
                ADD COLUMN IF NOT EXISTS compatibility_hash varchar(64),
                ADD COLUMN IF NOT EXISTS pinned_context_hash varchar(64),
                ADD COLUMN IF NOT EXISTS execution_scope_key_id varchar(64),
                ADD COLUMN IF NOT EXISTS physical_output_contract jsonb,
                ADD COLUMN IF NOT EXISTS evaluated_at timestamptz
        `);
        await knex.raw(`
            CREATE TABLE IF NOT EXISTS pre_aggregate_reuse_state (
                state_key text PRIMARY KEY CHECK (state_key = 'singleton'),
                phase text NOT NULL CHECK (phase IN ('compatibility', 'active')),
                activated_by text,
                reuse_enabled boolean NOT NULL DEFAULT false,
                reuse_updated_by text,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        await knex.raw(`
            INSERT INTO pre_aggregate_reuse_state (state_key, phase)
            VALUES ('singleton', 'compatibility') ON CONFLICT (state_key) DO NOTHING
        `);

        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const batch = await knex.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT d.pre_aggregate_definition_uuid, ce.name,
                           d.pre_aggregate_definition->>'name' AS definition_name,
                           p.scheduler_timezone, p.project_type
                    FROM pre_aggregate_definitions d
                    JOIN cached_explore ce ON ce.cached_explore_uuid = d.source_cached_explore_uuid
                    JOIN projects p ON p.project_uuid = d.project_uuid
                    WHERE (d.source_explore_name IS NULL OR d.pre_aggregate_name IS NULL
                       OR d.publication_version IS NULL OR d.schedule_revision IS NULL)
                       AND d.pre_aggregate_definition->>'name' IS NOT NULL
                    LIMIT 1000
                )
                UPDATE pre_aggregate_definitions d
                SET source_explore_name = batch.name,
                    pre_aggregate_name = batch.definition_name,
                    publication_version = COALESCE(d.publication_version, uuid_generate_v4()),
                    schedule_revision = COALESCE(d.schedule_revision, uuid_generate_v4()),
                    scheduler_timezone = batch.scheduler_timezone,
                    automatic_eligible = batch.project_type <> 'PREVIEW'
                        AND d.pre_aggregate_definition->>'table' IS NULL
                        AND d.materialization_metric_query IS NOT NULL
                        AND d.materialization_query_error IS NULL,
                    preparation_status = CASE WHEN d.materialization_query_error IS NULL THEN 'unverified' ELSE 'invalid' END
                FROM batch
                WHERE d.pre_aggregate_definition_uuid = batch.pre_aggregate_definition_uuid
            `);
            if (batch.rowCount === 0) break;
        }

        console.log(
            'Building pre-aggregate logical identity and source indexes',
        );
        const invalidIndexes = await knex.raw<{
            rows: { index_name: string }[];
        }>(`
            SELECT c.relname AS index_name FROM pg_class c
            JOIN pg_index i ON i.indexrelid = c.oid
            WHERE c.relnamespace = current_schema()::regnamespace
              AND c.relname IN ('pre_aggregate_definitions_logical_key', 'pre_aggregate_definitions_source_cache_idx', 'pre_aggregate_materializations_query_uuid_idx', 'pre_aggregate_materializations_definition_idx')
              AND NOT i.indisvalid
        `);
        for (const index of invalidIndexes.rows) {
            // eslint-disable-next-line no-await-in-loop
            await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [
                index.index_name,
            ]);
        }
        await knex.raw(`
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pre_aggregate_definitions_logical_key
            ON pre_aggregate_definitions (project_uuid, source_explore_name, pre_aggregate_name)
        `);
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_aggregate_definitions_source_cache_idx
            ON pre_aggregate_definitions (source_cached_explore_uuid)
        `);
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_aggregate_materializations_query_uuid_idx
            ON pre_aggregate_materializations (query_uuid)
        `);
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_aggregate_materializations_definition_idx
            ON pre_aggregate_materializations (pre_aggregate_definition_uuid)
        `);
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('pre_aggregate_reuse_state')) {
        const active = await knex('pre_aggregate_reuse_state')
            .where({ state_key: 'singleton', phase: 'active' })
            .first();
        if (active) {
            throw new Error(
                'irreversible: pre-aggregate reuse is active; use a compatible forward rollback that retains the registry schema',
            );
        }
    }
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS pre_aggregate_definitions_logical_key',
        );
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS pre_aggregate_definitions_source_cache_idx',
        );
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS pre_aggregate_materializations_query_uuid_idx',
        );
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS pre_aggregate_materializations_definition_idx',
        );
        await knex.raw(`ALTER TABLE pre_aggregate_definitions
            DROP COLUMN IF EXISTS source_explore_name,
            DROP COLUMN IF EXISTS pre_aggregate_name,
            DROP COLUMN IF EXISTS publication_version,
            DROP COLUMN IF EXISTS compatibility_hash,
            DROP COLUMN IF EXISTS schedule_revision,
            DROP COLUMN IF EXISTS scheduler_timezone,
            DROP COLUMN IF EXISTS physical_output_contract,
            DROP COLUMN IF EXISTS preparation_status,
            DROP COLUMN IF EXISTS automatic_eligible`);
        await knex.raw(`ALTER TABLE pre_aggregate_materializations
            DROP COLUMN IF EXISTS publication_version,
            DROP COLUMN IF EXISTS schedule_revision,
            DROP COLUMN IF EXISTS compatibility_hash,
            DROP COLUMN IF EXISTS pinned_context_hash,
            DROP COLUMN IF EXISTS execution_scope_key_id,
            DROP COLUMN IF EXISTS physical_output_contract,
            DROP COLUMN IF EXISTS evaluated_at`);
        await knex.schema.dropTableIfExists('pre_aggregate_reuse_state');
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
