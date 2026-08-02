import { Knex } from 'knex';

// Key ai_writeback_thread by the WORKSTREAM (one sandbox + one PR) so a single
// chat thread can drive several pull requests — across one or more repos, and
// more than one PR per repo. The table was previously 1:1 with ai_thread
// (UNIQUE ai_thread_uuid). Here we:
//   - add a nullable target_repo ("owner/repo"), backfilled from the linked PR,
//     used to resume the repo's most recent workstream by default;
//   - swap the single-key unique for a partial
//     UNIQUE(ai_thread_uuid, pull_request_uuid) WHERE pull_request_uuid IS NOT
//     NULL — a thread holds many rows, never two for the same PR, and a
//     not-yet-linked row (null pull_request_uuid) is allowed.
// A partial UNIQUE can only be an index, not a table constraint, in Postgres —
// hence CREATE UNIQUE INDEX. dbt writeback is just the special case with a
// single row. The table is small and the feature is pre-release, so this is one
// migration; down() restores the single-key shape.
const TableName = 'ai_writeback_thread';
const PullRequestsTableName = 'pull_requests';
const OldUniqueConstraint = 'ai_writeback_thread_ai_thread_uuid_unique';
const PartialUniqueIndex = 'ai_writeback_thread_thread_pr_unique';

export async function up(knex: Knex): Promise<void> {
    const hasTargetRepo = await knex.schema.hasColumn(TableName, 'target_repo');
    if (!hasTargetRepo) {
        await knex.schema.alterTable(TableName, (table) => {
            // "owner/repo" the row's sandbox/PR target; null only transiently
            // before backfill (existing rows) — new rows always set it.
            table.text('target_repo').nullable();
        });
    }

    // Backfill target_repo from the linked pull request. A legacy row with no
    // linked PR (pull_request_uuid IS NULL) keeps target_repo NULL and so won't
    // be picked up by findActiveWorkstreamByRepo — acceptable: those are
    // pre-feature orphans with no PR to resume. (The `provider` lives on the
    // pull_requests join, so no provider column is added here.)
    await knex.raw(
        `UPDATE ?? AS t
            SET target_repo = pr.owner || '/' || pr.repo
            FROM ?? AS pr
            WHERE t.pull_request_uuid = pr.pull_request_uuid
              AND t.target_repo IS NULL`,
        [TableName, PullRequestsTableName],
    );

    // Swap the single-key unique for the partial per-PR unique. Drop old first
    // so a thread can hold many rows. Guarded so the migration is re-runnable.
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        TableName,
        OldUniqueConstraint,
    ]);
    await knex.raw(
        `CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ?? (ai_thread_uuid, pull_request_uuid)
            WHERE pull_request_uuid IS NOT NULL`,
        [PartialUniqueIndex, TableName],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ??`, [PartialUniqueIndex]);
    // Restore the single-key unique. Safe only because every row was 1:1 with
    // its thread before this migration; multi-row threads must be cleared first.
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? UNIQUE (ai_thread_uuid)`, [
        TableName,
        OldUniqueConstraint,
    ]);

    const hasTargetRepo = await knex.schema.hasColumn(TableName, 'target_repo');
    if (hasTargetRepo) {
        await knex.schema.alterTable(TableName, (table) => {
            table.dropColumn('target_repo');
        });
    }
}
