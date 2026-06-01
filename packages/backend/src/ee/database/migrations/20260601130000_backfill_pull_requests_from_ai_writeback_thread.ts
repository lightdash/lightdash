import { Knex } from 'knex';

const AiWritebackThreadTableName = 'ai_writeback_thread';
const AiThreadTableName = 'ai_thread';
const AiPromptTableName = 'ai_prompt';
const PullRequestsTableName = 'pull_requests';

// Backfill source for AI write-back PRs — must match PullRequestSource.AI_AGENT.
const AI_AGENT_SOURCE = 'ai_agent';

// Local row shapes so the query builders don't resolve to the registered
// `knex/types/tables` composite types — keeping this migration decoupled from
// the live entity definitions (which enforce enum columns and restrict the
// insert/update shape) so it can't break when those types evolve.
type PullRequestRow = {
    pull_request_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string | null;
    provider: string;
    source: string;
    owner: string;
    repo: string;
    pr_number: number;
    pr_url: string;
    created_at: Date;
};

type WritebackRow = {
    ai_writeback_thread_uuid: string;
    ai_thread_uuid: string;
    pr_url: string;
    created_at: Date;
    pull_request_uuid: string | null;
};

type ParsedPrUrl = {
    provider: 'github' | 'gitlab';
    owner: string;
    repo: string;
    prNumber: number;
};

/**
 * Parse owner/repo/number out of a GitHub PR or GitLab merge-request URL.
 * GitLab nests the project under a group path and uses `/-/merge_requests/`;
 * we collapse the group/subgroup path into `owner` and keep the final segment
 * as `repo`. Returns null for anything we can't confidently parse.
 */
const parsePrUrl = (prUrl: string): ParsedPrUrl | null => {
    const github = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (github) {
        return {
            provider: 'github',
            owner: github[1],
            repo: github[2],
            prNumber: Number(github[3]),
        };
    }

    const gitlab = prUrl.match(
        /gitlab\.com\/(.+)\/([^/]+)\/-\/merge_requests\/(\d+)/,
    );
    if (gitlab) {
        return {
            provider: 'gitlab',
            owner: gitlab[1],
            repo: gitlab[2],
            prNumber: Number(gitlab[3]),
        };
    }

    return null;
};

export async function up(knex: Knex): Promise<void> {
    const hasWriteback = await knex.schema.hasTable(AiWritebackThreadTableName);
    const hasPullRequests = await knex.schema.hasTable(PullRequestsTableName);
    if (!hasWriteback || !hasPullRequests) {
        return;
    }

    // Only threads that produced a PR but aren't linked to a pull_requests row
    // yet. Re-running the migration is therefore a no-op for already-linked rows.
    const rows = await knex<WritebackRow>(AiWritebackThreadTableName)
        .innerJoin(
            AiThreadTableName,
            `${AiThreadTableName}.ai_thread_uuid`,
            `${AiWritebackThreadTableName}.ai_thread_uuid`,
        )
        .whereNull(`${AiWritebackThreadTableName}.pull_request_uuid`)
        .select<
            {
                ai_writeback_thread_uuid: string;
                ai_thread_uuid: string;
                organization_uuid: string;
                project_uuid: string;
                pr_url: string;
                created_at: Date;
            }[]
        >(
            `${AiWritebackThreadTableName}.ai_writeback_thread_uuid`,
            `${AiWritebackThreadTableName}.ai_thread_uuid`,
            `${AiThreadTableName}.organization_uuid`,
            `${AiThreadTableName}.project_uuid`,
            `${AiWritebackThreadTableName}.pr_url`,
            `${AiWritebackThreadTableName}.created_at`,
        );

    let linked = 0;
    let skipped = 0;

    for (const row of rows) {
        const parsed = parsePrUrl(row.pr_url);
        if (!parsed) {
            skipped += 1;
            console.log(
                `Skipping ai_writeback_thread ${row.ai_writeback_thread_uuid}: unparseable PR URL "${row.pr_url}"`,
            );
            // eslint-disable-next-line no-continue
            continue;
        }

        // The correct attribution is the user who drove the AI thread. The
        // thread itself has no user column, so we take the earliest prompt's
        // author (every thread has exactly one prompt author in practice).
        // eslint-disable-next-line no-await-in-loop
        const promptUser = await knex(AiPromptTableName)
            .where('ai_thread_uuid', row.ai_thread_uuid)
            .whereNotNull('created_by_user_uuid')
            .orderBy('created_at', 'asc')
            .first('created_by_user_uuid');
        const createdByUserUuid: string | null =
            promptUser?.created_by_user_uuid ?? null;

        // Reuse an existing pull_requests row (e.g. recorded by the live
        // code path) instead of hitting the unique (provider, owner, repo,
        // pr_number) constraint.
        // eslint-disable-next-line no-await-in-loop
        const existing = await knex<PullRequestRow>(PullRequestsTableName)
            .where({
                provider: parsed.provider,
                owner: parsed.owner,
                repo: parsed.repo,
                pr_number: parsed.prNumber,
            })
            .first('pull_request_uuid');

        let pullRequestUuid: string;
        if (existing) {
            pullRequestUuid = existing.pull_request_uuid;
        } else {
            // eslint-disable-next-line no-await-in-loop
            const [inserted] = await knex<PullRequestRow>(PullRequestsTableName)
                .insert({
                    organization_uuid: row.organization_uuid,
                    project_uuid: row.project_uuid,
                    created_by_user_uuid: createdByUserUuid,
                    provider: parsed.provider,
                    source: AI_AGENT_SOURCE,
                    owner: parsed.owner,
                    repo: parsed.repo,
                    pr_number: parsed.prNumber,
                    pr_url: row.pr_url,
                    // Preserve the original write-back time so the PR list
                    // orders by when the work actually happened.
                    created_at: row.created_at,
                })
                .returning('pull_request_uuid');
            pullRequestUuid = inserted.pull_request_uuid;
        }

        // eslint-disable-next-line no-await-in-loop
        await knex<WritebackRow>(AiWritebackThreadTableName)
            .where('ai_writeback_thread_uuid', row.ai_writeback_thread_uuid)
            .update({ pull_request_uuid: pullRequestUuid });

        linked += 1;
    }

    console.log(
        `Backfilled pull_requests from ai_writeback_thread: ${linked} linked, ${skipped} skipped`,
    );
}

export async function down(knex: Knex): Promise<void> {
    const hasWriteback = await knex.schema.hasTable(AiWritebackThreadTableName);
    const hasPullRequests = await knex.schema.hasTable(PullRequestsTableName);
    if (!hasWriteback || !hasPullRequests) {
        return;
    }

    // Drop the links first (FK is ON DELETE SET NULL, but we clear them
    // explicitly so the intent is obvious), then remove the AI-agent rows
    // this backfill produced.
    await knex<WritebackRow>(AiWritebackThreadTableName)
        .whereNotNull('pull_request_uuid')
        .update({ pull_request_uuid: null });

    await knex<PullRequestRow>(PullRequestsTableName)
        .where('source', AI_AGENT_SOURCE)
        .delete();
}
