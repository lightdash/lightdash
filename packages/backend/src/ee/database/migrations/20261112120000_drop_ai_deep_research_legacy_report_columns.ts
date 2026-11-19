import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const ReportExpiryIndexName = 'ai_deep_research_runs_report_expiry_idx';

export const classification = {
    kind: 'breaking',
    reason: 'Drops the legacy Deep Research report columns result_markdown, report_expires_at and report_expired_at, and the report expiry index. Releases that contain the legacy report removal neither read nor write them; older releases still write them from the stale-run sweep, run cancellation and the report cleanup job. Raw SQL only sets a lock timeout.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        // Dropping report_expires_at also drops the report expiry index.
        await knex.raw(
            `ALTER TABLE ${AiDeepResearchRunsTableName} DROP COLUMN IF EXISTS result_markdown, DROP COLUMN IF EXISTS report_expires_at, DROP COLUMN IF EXISTS report_expired_at`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${AiDeepResearchRunsTableName} ADD COLUMN IF NOT EXISTS result_markdown text, ADD COLUMN IF NOT EXISTS report_expires_at timestamptz, ADD COLUMN IF NOT EXISTS report_expired_at timestamptz`,
        );
        await knex.raw(
            `CREATE INDEX IF NOT EXISTS ${ReportExpiryIndexName} ON ${AiDeepResearchRunsTableName} (report_expires_at, report_expired_at)`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
