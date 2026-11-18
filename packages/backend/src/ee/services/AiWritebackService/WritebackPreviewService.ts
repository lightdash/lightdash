import { subject } from '@casl/ability';
import {
    DbtProjectType,
    extractPreviewProjectUuidFromUrl,
    extractPreviewUrlFromComments,
    ForbiddenError,
    getErrorMessage,
    ProjectType,
    RequestMethod,
    type SessionUser,
} from '@lightdash/common';
// Type-only import: the concrete GitHub client functions are injected (see
// `githubClient` dep) so they can be faked in tests without module mocking.
import type * as GithubClient from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import { WritebackAgentAccessError } from './errors';

/** The slice of the GitHub client this service needs, injected for testability. */
export type WritebackPreviewGithubClient = Pick<
    typeof GithubClient,
    | 'getInstallationToken'
    | 'getPullRequest'
    | 'getPullRequestComments'
    | 'createPullRequestComment'
>;

type WritebackPreviewServiceDeps = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    projectService: ProjectService;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    githubClient: WritebackPreviewGithubClient;
};

export type WritebackPreviewResult = {
    previewProjectUuid: string;
    previewUrl: string;
    compileJobUuid: string;
};

const parseGithubPullRequestUrl = (
    prUrl: string,
): { owner: string; repo: string; pullNumber: number } | null => {
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
        return null;
    }
    return { owner: match[1], repo: match[2], pullNumber: Number(match[3]) };
};

const parseProjectRepository = (
    repository: string | undefined,
): { owner: string; repo: string } | null => {
    if (!repository) {
        return null;
    }
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
        return null;
    }
    return { owner, repo };
};

/**
 * Creates Lightdash preview projects for writeback PRs server-side, instead of
 * relying on the customer repo's CI to deploy one and post its URL as a PR
 * comment. The preview is a copy of the production project with the dbt
 * connection pointed at the PR's head branch, compiled by our own scheduler —
 * the same adapter path a production refresh uses, so any repo whose explores
 * compile from a git connection compiles identically here.
 *
 * The preview URL is posted back to the PR as a comment in the same
 * `{siteUrl}/projects/{uuid}/...` shape `extractPreviewUrlFromComments` scans
 * for, so PullRequestsService's "View preview" resolution works unchanged.
 *
 * Only GitHub-connected projects are supported; anything else returns null so
 * callers surface no preview (CLI-deployed projects' explores cannot be
 * compiled server-side; GitLab support is a follow-up).
 */
export class WritebackPreviewService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly projectService: ProjectService;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly githubClient: WritebackPreviewGithubClient;

    constructor(deps: WritebackPreviewServiceDeps) {
        super({ serviceName: 'WritebackPreviewService' });
        this.lightdashConfig = deps.lightdashConfig;
        this.projectModel = deps.projectModel;
        this.projectService = deps.projectService;
        this.githubAppInstallationsModel = deps.githubAppInstallationsModel;
        this.githubClient = deps.githubClient;
    }

    async isSupported(projectUuid: string): Promise<boolean> {
        const project = await this.projectModel.get(projectUuid);
        return project.dbtConnection.type === DbtProjectType.GITHUB;
    }

    /**
     * Best-effort: returns null (never throws) when the project is not
     * GitHub-connected, the org has no GitHub App installation, or any git/API
     * step fails — so callers can fall back to the CI-comment flow.
     */
    async createPreviewForPullRequest({
        user,
        projectUuid,
        prUrl,
        assertPublishAllowed = null,
        reuseOnly = false,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
        assertPublishAllowed?: (() => Promise<void>) | null;
        /** Compile the preview this pull request already has again, and build none when it has none. */
        reuseOnly?: boolean;
    }): Promise<WritebackPreviewResult | null> {
        const project = await this.projectModel.get(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        try {
            const parsed = parseGithubPullRequestUrl(prUrl);
            if (!parsed) {
                return null;
            }
            if (project.dbtConnection.type !== DbtProjectType.GITHUB) {
                return null;
            }
            const configuredRepo = parseProjectRepository(
                project.dbtConnection.repository,
            );
            const expectedRepo = configuredRepo
                ? `${configuredRepo.owner}/${configuredRepo.repo}`.toLowerCase()
                : null;
            if (
                !configuredRepo ||
                expectedRepo !== `${parsed.owner}/${parsed.repo}`.toLowerCase()
            ) {
                this.logger.warn(
                    `Refusing to create writeback preview for ${prUrl}: it does not match project ${projectUuid}'s configured repository`,
                );
                return null;
            }
            if (!user.organizationUuid) {
                return null;
            }

            const installationId =
                await this.githubAppInstallationsModel.getInstallationId(
                    user.organizationUuid,
                );
            if (!installationId) {
                return null;
            }
            const token =
                await this.githubClient.getInstallationToken(installationId);

            const pullRequest = await this.githubClient.getPullRequest({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                token,
            });
            if (pullRequest.state !== 'open') {
                return null;
            }
            if (
                !pullRequest.headRepoFullName ||
                pullRequest.headRepoFullName.toLowerCase() !== expectedRepo
            ) {
                this.logger.warn(
                    `Refusing to create writeback preview for ${prUrl}: head branch is from ${
                        pullRequest.headRepoFullName ?? 'an unknown repository'
                    }, not ${expectedRepo}`,
                );
                return null;
            }

            const comments = await this.githubClient
                .getPullRequestComments({
                    owner: parsed.owner,
                    repo: parsed.repo,
                    pullNumber: parsed.pullNumber,
                    token,
                })
                .catch(() => []);
            if (assertPublishAllowed) await assertPublishAllowed();
            const existing = await this.refreshExistingPreview({
                user,
                projectUuid,
                headRef: pullRequest.headRef,
                comments,
            });
            if (existing || reuseOnly) return existing;

            const preview = await this.projectService.createPreview(
                user,
                projectUuid,
                {
                    name: `Preview: ${pullRequest.headRef}`,
                    copyContent: true,
                    dbtConnectionOverrides: { branch: pullRequest.headRef },
                    validateAfterCompile: true,
                },
                RequestMethod.BACKEND,
            );

            const previewUrl = `${this.lightdashConfig.siteUrl}/projects/${preview.projectUuid}/home`;

            if (assertPublishAllowed) await assertPublishAllowed();
            await this.githubClient.createPullRequestComment({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                body: [
                    `🔍 **Lightdash preview environment ready:** ${previewUrl}`,
                    '',
                    `Compiled from branch \`${pullRequest.headRef}\`. Explores may take a minute to appear while the project compiles.`,
                ].join('\n'),
                token,
            });

            return {
                previewProjectUuid: preview.projectUuid,
                previewUrl,
                compileJobUuid: preview.compileJobUuid,
            };
        } catch (error) {
            if (error instanceof WritebackAgentAccessError) throw error;
            this.logger.warn(
                `Failed to create writeback preview for ${prUrl}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }

    /** The preview an earlier round built for this branch, compiled again; null when there is none left to reuse. */
    private async refreshExistingPreview({
        user,
        projectUuid,
        headRef,
        comments,
    }: {
        user: SessionUser;
        projectUuid: string;
        headRef: string;
        comments: string[];
    }): Promise<WritebackPreviewResult | null> {
        const { siteUrl } = this.lightdashConfig;
        const previewUrl = extractPreviewUrlFromComments(comments, siteUrl);
        const previewProjectUuid = previewUrl
            ? extractPreviewProjectUuidFromUrl(previewUrl, siteUrl)
            : null;
        if (!previewUrl || !previewProjectUuid) return null;
        try {
            const preview = await this.projectModel.get(previewProjectUuid);
            // A comment is anyone's to write, so the project must be this branch's preview of this project.
            if (
                preview.type !== ProjectType.PREVIEW ||
                preview.upstreamProjectUuid !== projectUuid ||
                preview.dbtConnection.type !== DbtProjectType.GITHUB ||
                preview.dbtConnection.branch !== headRef
            ) {
                return null;
            }
            const { jobUuid } =
                await this.projectService.scheduleCompileProject(
                    user,
                    previewProjectUuid,
                    RequestMethod.BACKEND,
                    false,
                    true,
                );
            return { previewProjectUuid, previewUrl, compileJobUuid: jobUuid };
        } catch (error) {
            // An expired preview is gone, and a new one takes its place.
            this.logger.warn(
                `Could not reuse writeback preview ${previewProjectUuid}: ${getErrorMessage(error)}`,
            );
            return null;
        }
    }
}
