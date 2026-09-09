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
import pLimit from 'p-limit';
import * as BitbucketClient from '../../clients/bitbucket/Bitbucket';
import * as GithubClient from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
import type { LightdashConfig } from '../../config/parseConfig';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { BaseService } from '../BaseService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';

type PullRequestsServiceArguments = {
    lightdashConfig: LightdashConfig;
    pullRequestsModel: PullRequestsModel;
    gitIntegrationService: GitIntegrationService;
    projectModel: ProjectModel;
};

type PullRequestMetadata = { title: string; state: PullRequestState };

export class PullRequestsService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly gitIntegrationService: GitIntegrationService;

    private readonly projectModel: ProjectModel;

    constructor(args: PullRequestsServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.pullRequestsModel = args.pullRequestsModel;
        this.gitIntegrationService = args.gitIntegrationService;
        this.projectModel = args.projectModel;
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
            type:
                | DbtProjectType.GITHUB
                | DbtProjectType.GITLAB
                | DbtProjectType.BITBUCKET;
            owner: string;
            repo: string;
            hostDomain?: string;
            token: string;
            installationId?: string;
        },
    ): Promise<Record<number, PullRequestMetadata>> {
        try {
            if (
                provider === PullRequestProvider.BITBUCKET &&
                credentials.type === DbtProjectType.BITBUCKET &&
                owner === credentials.owner &&
                repo === credentials.repo
            ) {
                const limit = pLimit(8);
                const results = await Promise.allSettled(
                    prNumbers.map((pullNumber) =>
                        limit(() =>
                            BitbucketClient.getPullRequest({
                                owner,
                                repo,
                                token: credentials.token,
                                pullNumber,
                            }),
                        ),
                    ),
                );
                const failedCount = results.filter(
                    (result) => result.status === 'rejected',
                ).length;
                if (failedCount > 0) {
                    this.logger.warn(
                        'Failed to resolve Bitbucket pull request metadata',
                        { owner, repo, failedCount },
                    );
                }
                return Object.fromEntries(
                    results.flatMap((result) =>
                        result.status === 'fulfilled'
                            ? [
                                  [
                                      result.value.number,
                                      {
                                          title: result.value.title,
                                          state: result.value.state,
                                      },
                                  ],
                              ]
                            : [],
                    ),
                );
            }
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
        // Authorize against the project's own organization (resource-derived),
        // not the caller's org.
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid,
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
            const project = await this.projectModel.get(projectUuid);
            credentials =
                project.dbtConnection.type === DbtProjectType.BITBUCKET
                    ? await this.gitIntegrationService.getBitbucketCredentials(
                          user,
                          projectUuid,
                      )
                    : await this.gitIntegrationService.getGitCredentials(
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

        // Group by provider + repo before resolving metadata.
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
