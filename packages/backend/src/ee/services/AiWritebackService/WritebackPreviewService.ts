import {
    DbtProjectType,
    getErrorMessage,
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

/** The slice of the GitHub client this service needs, injected for testability. */
export type WritebackPreviewGithubClient = Pick<
    typeof GithubClient,
    'getInstallationToken' | 'getPullRequest' | 'createPullRequestComment'
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
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
    }): Promise<WritebackPreviewResult | null> {
        try {
            const parsed = parseGithubPullRequestUrl(prUrl);
            if (!parsed) {
                return null;
            }
            if (!(await this.isSupported(projectUuid))) {
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

            const preview = await this.projectService.createPreview(
                user,
                projectUuid,
                {
                    name: `Preview: ${pullRequest.headRef}`,
                    copyContent: true,
                    dbtConnectionOverrides: { branch: pullRequest.headRef },
                },
                RequestMethod.BACKEND,
            );

            const previewUrl = `${this.lightdashConfig.siteUrl}/projects/${preview.projectUuid}/home`;

            await this.githubClient.createPullRequestComment({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                body: [
                    `🔍 **Lightdash preview environment ready:** ${previewUrl}`,
                    '',
                    `Compiled from branch \`${pullRequest.headRef}\` by Lightdash — no CI required. Explores may take a minute to appear while the project compiles.`,
                ].join('\n'),
                token,
            });

            return {
                previewProjectUuid: preview.projectUuid,
                previewUrl,
                compileJobUuid: preview.compileJobUuid,
            };
        } catch (error) {
            this.logger.warn(
                `Failed to create writeback preview for ${prUrl}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }
}
