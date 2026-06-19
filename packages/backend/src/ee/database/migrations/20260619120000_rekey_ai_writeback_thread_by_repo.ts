import { Knex } from 'knex';

// Re-key ai_writeback_thread from one row per thread to one row per
// (thread, target_repo) so a single chat thread can drive edits to more than one
// repo (the general coding agent), each with its own sandbox + PR. dbt writeback
// is just the special case with a single row.
//
// Adds nullable target_repo ("owner/repo") + provider + branch, backfills the
// first two from the linked pull_requests row, then swaps the old
// UNIQUE(ai_thread_uuid) for a composite UNIQUE(ai_thread_uuid, target_repo).
// The table is small and the feature is pre-release, so this is done in one
// migration rather than a phased expand/contract; the down() restores the
// single-key shape.
const TableName = 'ai_writeback_thread';
const PullRequestsTableName = 'pull_requests';
const OldUniqueConstraint = 'ai_writeback_thread_ai_thread_uuid_unique';
const CompositeUniqueConstraint = 'ai_writeback_thread_thread_repo_unique';

export async function up(knex: Knex): Promise<void> {
    const hasTargetRepo = await knex.schema.hasColumn(TableName, 'target_repo');
    if (!hasTargetRepo) {
        await knex.schema.alterTable(TableName, (table) => {
            // "owner/repo" the row's sandbox/PR target; null only transiently
            // before backfill (existing rows) — new rows always set it.
            table.text('target_repo').nullable();
            // 'github' | 'gitlab' — the host for this row's PR.
            table.text('provider').nullable();
            // The feature branch this row's sandbox pushed to. Lets a later turn
            // adopt a "branch created, PR pending" row (PR-open failed) and open
            // the PR without re-committing. Null until a branch is created.
            table.text('branch').nullable();
        });
    }

    // Backfill target_repo + provider from the linked pull request.
    await knex.raw(
        `UPDATE ?? AS t
            SET target_repo = pr.owner || '/' || pr.repo,
                provider = pr.provider
            FROM ?? AS pr
            WHERE t.pull_request_uuid = pr.pull_request_uuid
              AND t.target_repo IS NULL`,
        [TableName, PullRequestsTableName],
    );

    // Swap the single-key unique for the composite. Drop old first so a thread
    // can hold multiple repo rows. Guard both so the migration is re-runnable.
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        TableName,
        OldUniqueConstraint,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? UNIQUE (ai_thread_uuid, target_repo)`,
        [TableName, CompositeUniqueConstraint],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        TableName,
        CompositeUniqueConstraint,
    ]);
    // Restore the single-key unique. Safe only because every pre-rekey row was
    // 1:1 with its thread; new multi-repo rows must be cleared first if present.
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? UNIQUE (ai_thread_uuid)`, [
        TableName,
        OldUniqueConstraint,
    ]);

    const hasTargetRepo = await knex.schema.hasColumn(TableName, 'target_repo');
    if (hasTargetRepo) {
        await knex.schema.alterTable(TableName, (table) => {
            table.dropColumn('target_repo');
            table.dropColumn('provider');
            table.dropColumn('branch');
        });
    }
}
