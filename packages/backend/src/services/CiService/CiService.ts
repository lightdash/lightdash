import { subject } from '@casl/ability';
import {
    CiCheckState,
    DbtProjectType,
    ForbiddenError,
    getErrorMessage,
    type CiCheck,
    type CiChecks,
    type SessionUser,
} from '@lightdash/common';
import type * as GithubClient from '../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { CiProvider } from './CiProvider';
import { GithubCiProvider, mapGithubMergeState } from './GithubCiProvider';

/** The slice of the GitHub client this service needs, injected for testability. */
export type CiServiceGithubClient = Pick<
    typeof GithubClient,
    'getInstallationToken' | 'getPullRequest' | 'listCheckRunsForRef'
>;

type CiServiceDeps = {
    projectModel: ProjectModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    githubClient: CiServiceGithubClient;
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
 * Roll a set of CI checks up to a single state for an at-a-glance summary.
 * Precedence: a failure dominates, then anything still running, then success;
 * a set with only cancelled/skipped/neutral checks rolls up to neutral.
 */
export const rollUpCiState = (checks: CiCheck[]): CiCheckState => {
    if (checks.some((c) => c.state === CiCheckState.FAILURE)) {
        return CiCheckState.FAILURE;
    }
    if (checks.some((c) => c.state === CiCheckState.PENDING)) {
        return CiCheckState.PENDING;
    }
    if (checks.some((c) => c.state === CiCheckState.SUCCESS)) {
        return CiCheckState.SUCCESS;
    }
    return CiCheckState.NEUTRAL;
};

/**
 * Resolves the live CI status of a pull request, abstracted across CI
 * providers. Today only GitHub Actions is supported (via GithubCiProvider);
 * other source-control types resolve to null so consumers render no CI section.
 *
 * Best-effort by design: any failure to resolve auth or call the provider
 * returns null rather than throwing, so the PR view degrades gracefully to "no
 * CI status" instead of erroring.
 */
export class CiService extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly githubClient: CiServiceGithubClient;

    private readonly githubCiProvider: CiProvider;

    constructor(deps: CiServiceDeps) {
        super({ serviceName: 'CiService' });
        this.projectModel = deps.projectModel;
        this.githubAppInstallationsModel = deps.githubAppInstallationsModel;
        this.githubClient = deps.githubClient;
        this.githubCiProvider = new GithubCiProvider({
            githubClient: deps.githubClient,
        });
    }

    /** Pick the CI adapter for a project's source-control type, or null. */
    private getCiProvider(connectionType: DbtProjectType): CiProvider | null {
        if (connectionType === DbtProjectType.GITHUB) {
            return this.githubCiProvider;
        }
        // GitLab pipelines / other hosts: not yet implemented.
        return null;
    }

    async getPullRequestChecks({
        user,
        projectUuid,
        prUrl,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
    }): Promise<CiChecks | null> {
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

        const provider = this.getCiProvider(project.dbtConnection.type);
        if (!provider || !user.organizationUuid) {
            return null;
        }

        try {
            const parsed = parseGithubPullRequestUrl(prUrl);
            if (!parsed) {
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

            // CI runs are keyed by ref; the PR's head branch is the ref whose
            // checks we want. (A closed/merged PR still resolves its head ref.)
            const pullRequest = await this.githubClient.getPullRequest({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                token,
            });

            const checks = await provider.getChecksForRef({
                owner: parsed.owner,
                repo: parsed.repo,
                ref: pullRequest.headRef,
                auth: { token },
            });

            return {
                provider: provider.provider,
                overall: rollUpCiState(checks),
                // The merge verdict comes from the repo's policy
                // (mergeable_state), never from the check roll-up — a failing
                // non-required check is `unstable` (still mergeable), not
                // `blocked`.
                mergeState: mapGithubMergeState(
                    pullRequest.mergeableState,
                    pullRequest.draft,
                ),
                checks,
            };
        } catch (error) {
            this.logger.warn(
                `Failed to resolve CI checks for ${prUrl}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }
}
