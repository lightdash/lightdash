import {
    KnexPaginateArgs,
    KnexPaginatedData,
    PullRequest,
    PullRequestProvider,
    PullRequestSource,
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

const mapDbPullRequest = (
    row: DbPullRequest,
    aiThread: AiThreadInfo | null,
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
    createdAt: row.created_at,
});

export class PullRequestsModel {
    readonly database: Knex;

    // Cached result of whether the enterprise ai_writeback_thread table exists.
    private aiWritebackTableExists: boolean | undefined;

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
        return mapDbPullRequest(row, null);
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

        return {
            data: data.map((row) =>
                mapDbPullRequest(
                    row,
                    threadInfo.get(row.pull_request_uuid) ?? null,
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
        return mapDbPullRequest(row, threadInfo.get(pullRequestUuid) ?? null);
    }

    async delete(pullRequestUuid: string): Promise<void> {
        await this.database(PullRequestsTableName)
            .where('pull_request_uuid', pullRequestUuid)
            .delete();
    }
}
