import {
    KnexPaginateArgs,
    KnexPaginatedData,
    PullRequest,
    PullRequestProvider,
    PullRequestSource,
    UnexpectedDatabaseError,
    type AiAgentReviewItemStatus,
    type AiAgentRootCause,
    type PullRequestReviewContext,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbPullRequest,
    PullRequestsTableName,
} from '../database/entities/pullRequests';
import KnexPaginate from '../database/pagination';
import {
    AiThreadTableName,
    AiWritebackThreadTableName,
} from '../ee/database/entities/ai';
import {
    AiAgentReviewItemTableName,
    AiAgentReviewRemediationTableName,
    AiAgentTurnSignalTableName,
} from '../ee/database/entities/aiAgentReviewClassifier';

type PullRequestsModelArguments = {
    database: Knex;
};

type CreatePullRequest = {
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string | null;
    provider: PullRequestProvider;
    source: PullRequestSource;
    owner: string;
    repo: string;
    prNumber: number;
    prUrl: string;
};

type AiThreadInfo = { aiThreadUuid: string; aiAgentUuid: string | null };
type ReviewSourceInfo = {
    reviewItemTitle: string | null;
    primaryRootCause: AiAgentRootCause | null;
    sourceFindingUuid: string;
    sourceThreadUuid: string;
    sourceProjectUuid: string;
    sourceAgentUuid: string;
};
type DirectReviewContextRow = ReviewSourceInfo & {
    pullRequestUuid: string;
    fingerprint: string;
    reviewStatus: AiAgentReviewItemStatus | null;
};
type FallbackReviewContextRow = {
    fingerprint: string;
    linkedPrUrl: string;
    reviewStatus: AiAgentReviewItemStatus | null;
};

const mapDbPullRequest = (
    row: DbPullRequest,
    aiThread: AiThreadInfo | null,
    reviewContext: PullRequestReviewContext | null,
): PullRequest => ({
    pullRequestUuid: row.pull_request_uuid,
    organizationUuid: row.organization_uuid,
    projectUuid: row.project_uuid,
    createdByUserUuid: row.created_by_user_uuid,
    provider: row.provider,
    source: row.source,
    owner: row.owner,
    repo: row.repo,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    aiThreadUuid: aiThread?.aiThreadUuid ?? null,
    aiAgentUuid: aiThread?.aiAgentUuid ?? null,
    reviewContext,
    createdAt: row.created_at,
});

const toPullRequestReviewContext = ({
    fingerprint,
    reviewStatus,
    reviewItemTitle,
    primaryRootCause,
    sourceFindingUuid,
    sourceThreadUuid,
    sourceProjectUuid,
    sourceAgentUuid,
}: {
    fingerprint: string;
    reviewStatus: AiAgentReviewItemStatus | null;
    reviewItemTitle: string | null;
    primaryRootCause: AiAgentRootCause | null;
    sourceFindingUuid: string;
    sourceThreadUuid: string;
    sourceProjectUuid: string;
    sourceAgentUuid: string;
}): PullRequestReviewContext => ({
    reviewItemUuid: fingerprint,
    reviewItemFingerprint: fingerprint,
    reviewTitle: reviewItemTitle ?? 'Review AI agent issue',
    reviewStatus: reviewStatus ?? 'open',
    primaryRootCause: primaryRootCause ?? 'ambiguous',
    sourceFindingUuid,
    sourceThreadUuid,
    sourceProjectUuid,
    sourceAgentUuid,
});

export class PullRequestsModel {
    readonly database: Knex;

    // Cached result of whether the enterprise ai_writeback_thread table exists.
    private aiWritebackTableExists: boolean | undefined;

    private aiReviewTablesExist: boolean | undefined;

    constructor(args: PullRequestsModelArguments) {
        this.database = args.database;
    }

    /**
     * Maps pull request uuids to the AI thread that produced them. The link
     * lives on the enterprise `ai_writeback_thread` table, which only exists
     * when the AI write-back feature is installed — so we skip the lookup
     * entirely (returning an empty map) in deployments without it.
     */
    private async getAiThreadInfo(
        pullRequestUuids: string[],
    ): Promise<Map<string, AiThreadInfo>> {
        const result = new Map<string, AiThreadInfo>();
        if (pullRequestUuids.length === 0) {
            return result;
        }

        if (this.aiWritebackTableExists === undefined) {
            this.aiWritebackTableExists = await this.database.schema.hasTable(
                AiWritebackThreadTableName,
            );
        }
        if (!this.aiWritebackTableExists) {
            return result;
        }

        const rows = await this.database(AiWritebackThreadTableName)
            .innerJoin(
                AiThreadTableName,
                `${AiThreadTableName}.ai_thread_uuid`,
                `${AiWritebackThreadTableName}.ai_thread_uuid`,
            )
            .whereIn(
                `${AiWritebackThreadTableName}.pull_request_uuid`,
                pullRequestUuids,
            )
            .whereNotNull(`${AiWritebackThreadTableName}.pull_request_uuid`)
            .select(
                `${AiWritebackThreadTableName}.pull_request_uuid`,
                `${AiWritebackThreadTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.agent_uuid`,
            );

        rows.forEach((row) => {
            if (row.pull_request_uuid) {
                result.set(row.pull_request_uuid, {
                    aiThreadUuid: row.ai_thread_uuid,
                    aiAgentUuid: row.agent_uuid ?? null,
                });
            }
        });
        return result;
    }

    private async hasAiReviewTables(): Promise<boolean> {
        if (this.aiReviewTablesExist === undefined) {
            const [hasReviewItemTable, hasRemediationTable, hasSignalTable] =
                await Promise.all([
                    this.database.schema.hasTable(AiAgentReviewItemTableName),
                    this.database.schema.hasTable(
                        AiAgentReviewRemediationTableName,
                    ),
                    this.database.schema.hasTable(AiAgentTurnSignalTableName),
                ]);
            this.aiReviewTablesExist =
                hasReviewItemTable && hasRemediationTable && hasSignalTable;
        }

        return this.aiReviewTablesExist;
    }

    private async getDirectReviewContextByPullRequestUuid(
        pullRequestUuids: string[],
    ): Promise<Map<string, PullRequestReviewContext>> {
        const result = new Map<string, PullRequestReviewContext>();
        if (pullRequestUuids.length === 0) {
            return result;
        }

        const rows = await this.database(
            `${AiAgentReviewRemediationTableName} as remediation`,
        )
            .leftJoin(
                `${AiAgentReviewItemTableName} as review_item`,
                function joinReviewItem() {
                    this.on(
                        'review_item.fingerprint',
                        'remediation.fingerprint',
                    ).andOn(
                        'review_item.organization_uuid',
                        'remediation.organization_uuid',
                    );
                },
            )
            .leftJoin(
                `${AiAgentTurnSignalTableName} as source_finding`,
                'source_finding.ai_agent_review_turn_signal_uuid',
                'remediation.source_ai_agent_review_turn_signal_uuid',
            )
            .whereIn('remediation.pull_request_uuid', pullRequestUuids)
            .select<DirectReviewContextRow[]>({
                pullRequestUuid: 'remediation.pull_request_uuid',
                fingerprint: 'remediation.fingerprint',
                reviewStatus: 'review_item.status',
                reviewItemTitle: 'source_finding.review_item_title',
                primaryRootCause: 'source_finding.primary_root_cause',
                sourceFindingUuid:
                    'remediation.source_ai_agent_review_turn_signal_uuid',
                sourceThreadUuid: 'remediation.source_thread_uuid',
                sourceProjectUuid: 'remediation.source_project_uuid',
                sourceAgentUuid: 'remediation.source_agent_uuid',
            })
            .orderBy('remediation.updated_at', 'desc');

        rows.forEach((row) => {
            if (!result.has(row.pullRequestUuid)) {
                result.set(
                    row.pullRequestUuid,
                    toPullRequestReviewContext({
                        fingerprint: row.fingerprint,
                        reviewStatus: row.reviewStatus,
                        reviewItemTitle: row.reviewItemTitle,
                        primaryRootCause: row.primaryRootCause,
                        sourceFindingUuid: row.sourceFindingUuid,
                        sourceThreadUuid: row.sourceThreadUuid,
                        sourceProjectUuid: row.sourceProjectUuid,
                        sourceAgentUuid: row.sourceAgentUuid,
                    }),
                );
            }
        });

        return result;
    }

    private async getLatestReviewSourceInfoByFingerprint(
        fingerprints: string[],
    ): Promise<Map<string, ReviewSourceInfo>> {
        const result = new Map<string, ReviewSourceInfo>();
        if (fingerprints.length === 0) {
            return result;
        }

        const rows = await this.database(AiAgentTurnSignalTableName)
            .distinctOn('fingerprint')
            .whereIn('fingerprint', fingerprints)
            .where('promoted_to_finding', true)
            .select<({ fingerprint: string } & ReviewSourceInfo)[]>({
                fingerprint: 'fingerprint',
                reviewItemTitle: 'review_item_title',
                primaryRootCause: 'primary_root_cause',
                sourceFindingUuid: 'ai_agent_review_turn_signal_uuid',
                sourceThreadUuid: 'ai_thread_uuid',
                sourceProjectUuid: 'project_uuid',
                sourceAgentUuid: 'agent_uuid',
            })
            .orderBy('fingerprint')
            .orderBy('created_at', 'desc');

        rows.forEach((row) => {
            result.set(row.fingerprint, {
                reviewItemTitle: row.reviewItemTitle,
                primaryRootCause: row.primaryRootCause,
                sourceFindingUuid: row.sourceFindingUuid,
                sourceThreadUuid: row.sourceThreadUuid,
                sourceProjectUuid: row.sourceProjectUuid,
                sourceAgentUuid: row.sourceAgentUuid,
            });
        });

        return result;
    }

    private async getFallbackReviewContextByPrUrl(
        prUrls: string[],
    ): Promise<Map<string, PullRequestReviewContext>> {
        const result = new Map<string, PullRequestReviewContext>();
        if (prUrls.length === 0) {
            return result;
        }

        const rows = await this.database(
            `${AiAgentReviewItemTableName} as review_item`,
        )
            .whereIn('review_item.linked_pr_url', prUrls)
            .select<FallbackReviewContextRow[]>({
                fingerprint: 'review_item.fingerprint',
                linkedPrUrl: 'review_item.linked_pr_url',
                reviewStatus: 'review_item.status',
            })
            .orderBy('review_item.updated_at', 'desc');

        const sourceInfoByFingerprint =
            await this.getLatestReviewSourceInfoByFingerprint(
                rows.map((row) => row.fingerprint),
            );

        rows.forEach((row) => {
            if (result.has(row.linkedPrUrl)) {
                return;
            }

            const sourceInfo = sourceInfoByFingerprint.get(row.fingerprint);
            if (!sourceInfo) {
                return;
            }

            result.set(
                row.linkedPrUrl,
                toPullRequestReviewContext({
                    fingerprint: row.fingerprint,
                    reviewStatus: row.reviewStatus,
                    reviewItemTitle: sourceInfo.reviewItemTitle,
                    primaryRootCause: sourceInfo.primaryRootCause,
                    sourceFindingUuid: sourceInfo.sourceFindingUuid,
                    sourceThreadUuid: sourceInfo.sourceThreadUuid,
                    sourceProjectUuid: sourceInfo.sourceProjectUuid,
                    sourceAgentUuid: sourceInfo.sourceAgentUuid,
                }),
            );
        });

        return result;
    }

    private async getReviewContextInfo(
        pullRequests: Pick<PullRequest, 'pullRequestUuid' | 'prUrl'>[],
    ): Promise<{
        byPullRequestUuid: Map<string, PullRequestReviewContext>;
        byPrUrl: Map<string, PullRequestReviewContext>;
    }> {
        if (pullRequests.length === 0 || !(await this.hasAiReviewTables())) {
            return {
                byPullRequestUuid: new Map(),
                byPrUrl: new Map(),
            };
        }

        const [byPullRequestUuid, byPrUrl] = await Promise.all([
            this.getDirectReviewContextByPullRequestUuid(
                pullRequests.map((row) => row.pullRequestUuid),
            ),
            this.getFallbackReviewContextByPrUrl(
                pullRequests.map((row) => row.prUrl),
            ),
        ]);

        return { byPullRequestUuid, byPrUrl };
    }

    async create(data: CreatePullRequest): Promise<PullRequest> {
        const [row] = await this.database(PullRequestsTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                created_by_user_uuid: data.createdByUserUuid,
                provider: data.provider,
                source: data.source,
                owner: data.owner,
                repo: data.repo,
                pr_number: data.prNumber,
                pr_url: data.prUrl,
            })
            .returning('*');

        // A newly created PR has no ai_writeback_thread link yet.
        return mapDbPullRequest(row, null, null);
    }

    /**
     * Record a PR, tolerating an existing row for the same
     * (provider, owner, repo, pr_number). Callers that record a PR *after* it
     * has already been opened on the provider (e.g. AI write-back) must not
     * fail the whole run on a duplicate — a retry, or the same PR already
     * recorded by another path, would otherwise throw on the unique
     * constraint. The insert-or-ignore is atomic, so concurrent callers are
     * safe; the existing row's attribution (source/user) is preserved rather
     * than overwritten.
     */
    async findOrCreate(data: CreatePullRequest): Promise<PullRequest> {
        const inserted = await this.database(PullRequestsTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                created_by_user_uuid: data.createdByUserUuid,
                provider: data.provider,
                source: data.source,
                owner: data.owner,
                repo: data.repo,
                pr_number: data.prNumber,
                pr_url: data.prUrl,
            })
            .onConflict(['provider', 'owner', 'repo', 'pr_number'])
            .ignore()
            .returning('*');

        if (inserted.length > 0) {
            return mapDbPullRequest(inserted[0], null, null);
        }

        // The insert was ignored because a row already exists — return it.
        const existing = await this.database(PullRequestsTableName)
            .where({
                provider: data.provider,
                owner: data.owner,
                repo: data.repo,
                pr_number: data.prNumber,
            })
            .first();
        if (!existing) {
            // Shouldn't happen: a conflict implies a row exists.
            throw new UnexpectedDatabaseError(
                'Failed to record pull request: row neither inserted nor found',
            );
        }
        return mapDbPullRequest(existing, null, null);
    }

    async getByProject(
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<PullRequest[]>> {
        const query = this.database(PullRequestsTableName)
            .where('project_uuid', projectUuid)
            .orderBy('created_at', 'desc')
            .select<DbPullRequest[]>('*');

        const { data, pagination } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        const threadInfo = await this.getAiThreadInfo(
            data.map((row) => row.pull_request_uuid),
        );
        const reviewContext = await this.getReviewContextInfo(
            data.map((row) => ({
                pullRequestUuid: row.pull_request_uuid,
                prUrl: row.pr_url,
            })),
        );

        return {
            data: data.map((row) =>
                mapDbPullRequest(
                    row,
                    threadInfo.get(row.pull_request_uuid) ?? null,
                    reviewContext.byPullRequestUuid.get(
                        row.pull_request_uuid,
                    ) ??
                        reviewContext.byPrUrl.get(row.pr_url) ??
                        null,
                ),
            ),
            pagination,
        };
    }

    async find(pullRequestUuid: string): Promise<PullRequest | null> {
        const row = await this.database(PullRequestsTableName)
            .where('pull_request_uuid', pullRequestUuid)
            .first();

        if (!row) {
            return null;
        }

        const threadInfo = await this.getAiThreadInfo([pullRequestUuid]);
        const reviewContext = await this.getReviewContextInfo([
            { pullRequestUuid, prUrl: row.pr_url },
        ]);

        return mapDbPullRequest(
            row,
            threadInfo.get(pullRequestUuid) ?? null,
            reviewContext.byPullRequestUuid.get(pullRequestUuid) ??
                reviewContext.byPrUrl.get(row.pr_url) ??
                null,
        );
    }

    /**
     * Look up a recorded pull request by its URL, scoped to a project. Used to
     * resolve a PR the frontend only knows by URL (e.g. from an AI write-back
     * tool result) back to its stored owner/repo/number before reaching out to
     * the provider.
     */
    async findByProjectAndUrl(
        projectUuid: string,
        prUrl: string,
    ): Promise<PullRequest | null> {
        const row = await this.database(PullRequestsTableName)
            .where('project_uuid', projectUuid)
            .andWhere('pr_url', prUrl)
            .first();

        if (!row) {
            return null;
        }

        const threadInfo = await this.getAiThreadInfo([row.pull_request_uuid]);
        const reviewContext = await this.getReviewContextInfo([
            { pullRequestUuid: row.pull_request_uuid, prUrl: row.pr_url },
        ]);
        return mapDbPullRequest(
            row,
            threadInfo.get(row.pull_request_uuid) ?? null,
            reviewContext.byPullRequestUuid.get(row.pull_request_uuid) ??
                reviewContext.byPrUrl.get(row.pr_url) ??
                null,
        );
    }

    async delete(pullRequestUuid: string): Promise<void> {
        await this.database(PullRequestsTableName)
            .where('pull_request_uuid', pullRequestUuid)
            .delete();
    }
}
