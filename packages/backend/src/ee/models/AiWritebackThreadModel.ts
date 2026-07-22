import { type AiWritebackWorkstream } from '@lightdash/common';
import { Knex } from 'knex';
import { PullRequestsTableName } from '../../database/entities/pullRequests';
import {
    AiWritebackThreadTable,
    AiWritebackThreadTableName,
    DbAiWritebackThread,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
};

/**
 * A writeback thread row enriched with the PR URL resolved from the linked
 * `pull_requests` row. `pr_url` is null only when the link was cleared (the
 * FK is ON DELETE SET NULL).
 */
export type AiWritebackThreadWithPrUrl = DbAiWritebackThread & {
    pr_url: string | null;
};

/**
 * A writeback thread that points at a registry sandbox (`sandbox_uuid` is
 * non-null). A null `sandbox_uuid` only occurs for a row an old pod inserts
 * mid-rollout, which is not resumable; the service narrows to this type before
 * driving a resume.
 */
export type ResumableWritebackThread = AiWritebackThreadWithPrUrl & {
    sandbox_uuid: string;
};

export class AiWritebackThreadModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    /**
     * The thread's most-recent workstream row, regardless of repo. Used by the
     * dbt-writeback path (one workstream per thread) to read the source the
     * thread is bound to before resolving which dbt source to target. The
     * general agent routes by (repo)/(PR) instead — see findActiveWorkstreamByRepo.
     */
    async findByAiThreadUuid(
        aiThreadUuid: string,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const row = await this.database(AiWritebackThreadTableName)
            .leftJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(`${AiWritebackThreadTableName}.ai_thread_uuid`, aiThreadUuid)
            .orderBy(`${AiWritebackThreadTableName}.created_at`, 'desc')
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    /**
     * The default resume row for a `(thread, repo)` pair: the most-recently
     * created workstream targeting that repo. A thread can now hold several
     * workstreams (PRs) per repo; with no explicit routing we continue the
     * latest line of work. For a thread that has only ever opened one PR per
     * repo (every dbt-writeback thread, and the common general case) this is
     * exactly the single row, so behaviour is unchanged.
     */
    async findActiveWorkstreamByRepo(
        aiThreadUuid: string,
        targetRepo: string,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const row = await this.database(AiWritebackThreadTableName)
            .leftJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(`${AiWritebackThreadTableName}.ai_thread_uuid`, aiThreadUuid)
            .where(`${AiWritebackThreadTableName}.target_repo`, targetRepo)
            .orderBy(`${AiWritebackThreadTableName}.created_at`, 'desc')
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    /**
     * Resolve the specific workstream whose linked PR matches `prUrl` — the
     * explicit-routing path, so the agent can target one of several open PRs on
     * the same repo. Returns null when no workstream owns that PR (e.g. the user
     * pasted an external PR link not yet adopted into the thread).
     */
    async findByAiThreadUuidAndPrUrl(
        aiThreadUuid: string,
        prUrl: string,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const row = await this.database(AiWritebackThreadTableName)
            .innerJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(`${AiWritebackThreadTableName}.ai_thread_uuid`, aiThreadUuid)
            .where(`${PullRequestsTableName}.pr_url`, prUrl)
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    async findByProjectUuidAndPrUrl(
        projectUuid: string,
        prUrl: string,
    ): Promise<AiWritebackThreadWithPrUrl | null> {
        const row = await this.database(AiWritebackThreadTableName)
            .innerJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(`${PullRequestsTableName}.project_uuid`, projectUuid)
            .where(`${PullRequestsTableName}.pr_url`, prUrl)
            .select<AiWritebackThreadWithPrUrl>(
                `${AiWritebackThreadTableName}.*`,
                `${PullRequestsTableName}.pr_url`,
            )
            .first();
        return row ?? null;
    }

    /**
     * Every workstream (one sandbox + one PR) a thread has opened, newest first,
     * with its PR url / number / summary joined in. Optionally scoped to a single
     * repo. Drives the `listWorkstreams` tool so the agent can route a follow-up
     * to the right PR. Only rows with a linked PR are returned.
     */
    async listByAiThreadUuid(
        aiThreadUuid: string,
        targetRepo: string | null,
    ): Promise<
        Array<{
            owner: string;
            repo: string;
            provider: string;
            pr_url: string;
            pr_number: number;
            summary: string | null;
            created_at: Date;
        }>
    > {
        const query = this.database(AiWritebackThreadTableName)
            .innerJoin(
                PullRequestsTableName,
                `${PullRequestsTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.pull_request_uuid`,
            )
            .where(
                `${AiWritebackThreadTableName}.ai_thread_uuid`,
                aiThreadUuid,
            );
        if (targetRepo !== null) {
            void query.where(
                `${AiWritebackThreadTableName}.target_repo`,
                targetRepo,
            );
        }
        return query
            .orderBy(`${AiWritebackThreadTableName}.created_at`, 'desc')
            .select(
                `${PullRequestsTableName}.owner`,
                `${PullRequestsTableName}.repo`,
                `${PullRequestsTableName}.provider`,
                `${PullRequestsTableName}.pr_url`,
                `${PullRequestsTableName}.pr_number`,
                `${PullRequestsTableName}.summary`,
                `${AiWritebackThreadTableName}.created_at`,
            );
    }

    /**
     * Cross-pod workstream guard (H1). Takes a Postgres SESSION-level advisory
     * lock keyed on `lockKey` (a `(thread, repo)` / `(thread, PR)` identifier) so
     * a second turn for the same workstream — on THIS pod or another — is rejected
     * rather than racing the first into a duplicate PR. The lock is NOT
     * transaction-scoped: it is held across the whole multi-minute agent run, so
     * a session lock (released explicitly) is used instead of `pg_advisory_xact_lock`,
     * which would force an open transaction for the duration. This pins one pooled
     * connection per in-flight coding-agent turn; the feature is flag-gated and
     * low-concurrency, so the cost is bounded.
     *
     * `pg_try_advisory_lock` is non-blocking: a `false` result means another
     * session already holds the workstream, so the caller rejects the racing turn.
     * Returns a `release()` that unlocks AND returns the connection to the pool;
     * the caller MUST call it in a `finally`. Returns null when the lock is held.
     */
    async acquireWorkstreamLock(
        lockKey: string,
    ): Promise<{ release: () => Promise<void> } | null> {
        const connection = await this.database.client.acquireConnection();
        try {
            const result = await connection.query(
                'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
                [lockKey],
            );
            const locked = result.rows[0]?.locked === true;
            if (!locked) {
                await this.database.client.releaseConnection(connection);
                return null;
            }
            return {
                release: async () => {
                    try {
                        await connection.query(
                            'SELECT pg_advisory_unlock(hashtext($1))',
                            [lockKey],
                        );
                    } finally {
                        await this.database.client.releaseConnection(
                            connection,
                        );
                    }
                },
            };
        } catch (error) {
            await this.database.client.releaseConnection(connection);
            throw error;
        }
    }

    /**
     * Record a workstream AFTER its PR has opened. A row is only ever written
     * once a PR exists (a concrete `pullRequestUuid`), so there is no "PR pending"
     * placeholder state: on a commit-ok/PR-open-fail, no row is written and the
     * next turn opens a FRESH PR (R11 = fresh-PR-on-retry, not branch adoption).
     * `pull_request_uuid` is nullable in the schema only so the FK can ON DELETE
     * SET NULL when a recorded PR is later deleted; reads handle that null.
     */
    async create(data: {
        aiThreadUuid: string;
        sandboxUuid: string;
        pullRequestUuid: string;
        // The dbt source this thread targets — null for the project's primary
        // dbt connection. Binds the thread to one repo across resumes.
        projectDbtSourceUuid: string | null;
        targetRepo: string;
        workstream: AiWritebackWorkstream;
    }): Promise<DbAiWritebackThread> {
        const [row] = await this.database<AiWritebackThreadTable>(
            AiWritebackThreadTableName,
        )
            .insert({
                ai_thread_uuid: data.aiThreadUuid,
                sandbox_uuid: data.sandboxUuid,
                pull_request_uuid: data.pullRequestUuid,
                project_dbt_source_uuid: data.projectDbtSourceUuid,
                target_repo: data.targetRepo,
                workstream: data.workstream,
            })
            .returning('*');
        return row;
    }

    async deleteByAiThreadUuid(aiThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .delete();
    }

    async deleteByUuid(aiWritebackThreadUuid: string): Promise<void> {
        await this.database<AiWritebackThreadTable>(AiWritebackThreadTableName)
            .where('ai_writeback_thread_uuid', aiWritebackThreadUuid)
            .delete();
    }
}
