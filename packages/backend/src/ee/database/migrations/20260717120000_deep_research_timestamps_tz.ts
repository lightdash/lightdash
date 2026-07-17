import { Knex } from 'knex';

/**
 * Naive timestamps are stored as UTC wall clock (session tz UTC) but parsed
 * by node-postgres in the process's local timezone, skewing serialized
 * instants by the host's UTC offset (e.g. +1h under BST in local dev) —
 * visible as an inflated "Elapsed" on running run cards. timestamptz makes
 * the parse offset-explicit and timezone-independent.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ai_deep_research_runs
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
            ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC',
            ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC',
            ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC',
            ALTER COLUMN cancellation_requested_at TYPE timestamptz USING cancellation_requested_at AT TIME ZONE 'UTC'
    `);
    await knex.raw(`
        ALTER TABLE ai_deep_research_events
            ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ai_deep_research_runs
            ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
            ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC',
            ALTER COLUMN started_at TYPE timestamp USING started_at AT TIME ZONE 'UTC',
            ALTER COLUMN completed_at TYPE timestamp USING completed_at AT TIME ZONE 'UTC',
            ALTER COLUMN cancellation_requested_at TYPE timestamp USING cancellation_requested_at AT TIME ZONE 'UTC'
    `);
    await knex.raw(`
        ALTER TABLE ai_deep_research_events
            ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC'
    `);
}
