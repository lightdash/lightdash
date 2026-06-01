import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    getErrorMessage,
    KnexPaginateArgs,
    KnexPaginatedData,
    PullRequest,
    PullRequestProvider,
    PullRequestState,
    PullRequestWithStatus,
    SessionUser,
} from '@lightdash/common';
import * as GithubClient from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
import type { LightdashConfig } from '../../config/parseConfig';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { BaseService } from '../BaseService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';

type PullRequestsServiceArguments = {
    lightdashConfig: LightdashConfig;
    pullRequestsModel: PullRequestsModel;
    gitIntegrationService: GitIntegrationService;
};

type PullRequestMetadata = { title: string; state: PullRequestState };

export class PullRequestsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly gitIntegrationService: GitIntegrationService;

    constructor(args: PullRequestsServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.pullRequestsModel = args.pullRequestsModel;
        this.gitIntegrationService = args.gitIntegrationService;
    }

    /**
     * Batch-resolve live title/state for a group of pull requests that share a
     * provider + repo. Returns a map keyed by PR number. Any failure (lost
     * access, deleted repo, bad token) resolves to an empty map so the caller
     * falls back to the stored URL rather than failing the whole request.
     */
    private async resolveMetadata(
        provider: PullRequestProvider,
        owner: string,
        repo: string,
        prNumbers: number[],
        credentials: {
            type: DbtProjectType.GITHUB | DbtProjectType.GITLAB;
            hostDomain?: string;
            token: string;
            installationId?: string;
        },
    ): Promise<Record<number, PullRequestMetadata>> {
        try {
            if (
                provider === PullRequestProvider.GITHUB &&
                credentials.type === DbtProjectType.GITHUB
            ) {
                return await GithubClient.getPullRequests({
                    owner,
                    repo,
                    pullNumbers: prNumbers,
                    installationId: credentials.installationId,
                    token: credentials.token,
                });
            }
            if (
                provider === PullRequestProvider.GITLAB &&
                credentials.type === DbtProjectType.GITLAB
            ) {
                return await GitlabClient.getMergeRequests({
                    owner,
                    repo,
                    iids: prNumbers,
                    token: credentials.token,
                    hostDomain: credentials.hostDomain,
                });
            }
        } catch (error) {
            this.logger.warn('Failed to resolve pull request metadata', {
                provider,
                owner,
                repo,
                error: getErrorMessage(error),
            });
        }
        return {};
    }

    async getPullRequests(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<PullRequestWithStatus[]>> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Paginate in the DB first, then resolve live metadata only for the
        // current page of rows — never for the whole table.
        const { data: pullRequests, pagination } =
            await this.pullRequestsModel.getByProject(
                projectUuid,
                paginateArgs,
            );
        if (pullRequests.length === 0) {
            return { data: [], pagination };
        }

        // Resolving live metadata needs the project's git credentials; if they
        // can't be resolved, still return the stored rows without title/state.
        let credentials;
        try {
            credentials = await this.gitIntegrationService.getGitCredentials(
                user,
                projectUuid,
            );
        } catch (error) {
            this.logger.warn(
                'Could not resolve git credentials for pull requests',
                { projectUuid, error: getErrorMessage(error) },
            );
            return {
                data: pullRequests.map((pr) => ({
                    ...pr,
                    title: null,
                    state: null,
                })),
                pagination,
            };
        }

        // Group by provider + repo so each group is one batched API call.
        const groups = new Map<string, PullRequest[]>();
        pullRequests.forEach((pr) => {
            const key = `${pr.provider}:${pr.owner}/${pr.repo}`;
            const group = groups.get(key) ?? [];
            group.push(pr);
            groups.set(key, group);
        });

        const metadataByUuid = new Map<string, PullRequestMetadata>();
        await Promise.all(
            [...groups.values()].map(async (group) => {
                const { provider, owner, repo } = group[0];
                const metadata = await this.resolveMetadata(
                    provider,
                    owner,
                    repo,
                    group.map((pr) => pr.prNumber),
                    credentials,
                );
                group.forEach((pr) => {
                    const found = metadata[pr.prNumber];
                    if (found) {
                        metadataByUuid.set(pr.pullRequestUuid, found);
                    }
                });
            }),
        );

        return {
            data: pullRequests.map((pr) => {
                const metadata = metadataByUuid.get(pr.pullRequestUuid);
                return {
                    ...pr,
                    title: metadata?.title ?? null,
                    state: metadata?.state ?? null,
                };
            }),
            pagination,
        };
    }
}
