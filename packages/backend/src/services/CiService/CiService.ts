import { subject } from '@casl/ability';
import {
    CiCheckState,
    DbtProjectType,
    ForbiddenError,
    getErrorMessage,
    ParameterError,
    type CiCheck,
    type CiChecks,
    type ClosePullRequestResult,
    type DbtGithubProjectConfig,
    type MergePullRequestResult,
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
    | 'getInstallationToken'
    | 'getPullRequest'
    | 'listCheckRunsForRef'
    | 'mergePullRequest'
    | 'closePullRequest'
    | 'getPullRequestDiff'
    | 'getCommitDiff'
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
 * Reads are best-effort by design: any failure to resolve auth or call the
 * provider returns null rather than throwing, so the PR view degrades
 * gracefully to "no CI status" instead of erroring. The merge action is the
 * exception — being a write, it throws so the caller can explain the failure.
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
        commitSha,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
        /**
         * Pin the checks to a specific commit. When set, CI is resolved for this
         * exact SHA rather than the PR's live head branch — so an earlier turn's
         * card keeps showing its own commit's checks after a later turn pushes a
         * new commit. Omitted (older persisted cards) falls back to the head.
         */
        commitSha?: string;
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

            // The PR URL is caller-supplied. Before querying GitHub with the
            // org installation token, confirm it points at this project's own
            // configured repository — otherwise a user with view:SourceCode on
            // one project could read CI status of any other repo the app is
            // installed on.
            const [configuredOwner, configuredRepo] = (
                project.dbtConnection as DbtGithubProjectConfig
            ).repository.split('/');
            if (
                !configuredOwner ||
                !configuredRepo ||
                configuredOwner.toLowerCase() !== parsed.owner.toLowerCase() ||
                configuredRepo.toLowerCase() !== parsed.repo.toLowerCase()
            ) {
                this.logger.warn(
                    `Refusing to resolve CI checks for ${prUrl}: it does not match project ${projectUuid}'s configured repository`,
                );
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

            // The PR is still fetched for its policy-derived merge verdict
            // (mergeable_state), which is inherently a property of the PR's
            // current head — not of a historical commit.
            const pullRequest = await this.githubClient.getPullRequest({
                owner: parsed.owner,
                repo: parsed.repo,
                pullNumber: parsed.pullNumber,
                token,
            });

            // CI runs are keyed by ref. Pin to the caller's commit SHA when
            // given (so an earlier card stays tied to its own commit); otherwise
            // fall back to the PR's head branch (older cards, no-commit turns).
            // A closed/merged PR still resolves its head ref.
            const checks = await provider.getChecksForRef({
                owner: parsed.owner,
                repo: parsed.repo,
                ref: commitSha ?? pullRequest.headRef,
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
                merged: pullRequest.merged,
                state: pullRequest.state,
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

    /**
     * Resolve the raw unified diff of a write-back PR for the card's diff
     * viewer. When `commitSha` is set the diff is scoped to that single commit
     * (matching the per-commit framing of the card); otherwise it's the whole
     * PR. Best-effort like `getPullRequestChecks`: returns null rather than
     * throwing so the viewer degrades to an empty state.
     */
    async getPullRequestDiff({
        user,
        projectUuid,
        prUrl,
        commitSha,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
        commitSha?: string;
    }): Promise<string | null> {
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

            // Same guard as getPullRequestChecks: the PR URL is caller-supplied,
            // so confirm it targets this project's own repository before
            // querying GitHub with the org installation token.
            const [configuredOwner, configuredRepo] = (
                project.dbtConnection as DbtGithubProjectConfig
            ).repository.split('/');
            if (
                !configuredOwner ||
                !configuredRepo ||
                configuredOwner.toLowerCase() !== parsed.owner.toLowerCase() ||
                configuredRepo.toLowerCase() !== parsed.repo.toLowerCase()
            ) {
                this.logger.warn(
                    `Refusing to resolve diff for ${prUrl}: it does not match project ${projectUuid}'s configured repository`,
                );
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

            return commitSha
                ? await this.githubClient.getCommitDiff({
                      owner: parsed.owner,
                      repo: parsed.repo,
                      ref: commitSha,
                      token,
                  })
                : await this.githubClient.getPullRequestDiff({
                      owner: parsed.owner,
                      repo: parsed.repo,
                      pullNumber: parsed.pullNumber,
                      token,
                  });
        } catch (error) {
            this.logger.warn(
                `Failed to resolve diff for ${prUrl}: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
    }

    /**
     * Resolve the GitHub context for a write action on a PR: enforce
     * `manage:SourceCode` (the gate for opening the write-back PR, from a
     * feature branch — hence isProtectedBranch: false), verify the
     * caller-supplied URL targets this project's own repo, and mint an
     * installation token. Throws (not null) so callers can explain the failure.
     */
    private async resolveWritePrContext({
        user,
        projectUuid,
        prUrl,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
    }): Promise<{
        owner: string;
        repo: string;
        pullNumber: number;
        token: string;
    }> {
        const project = await this.projectModel.get(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const provider = this.getCiProvider(project.dbtConnection.type);
        if (!provider || !user.organizationUuid) {
            throw new ParameterError(
                'Only supported for GitHub-connected projects',
            );
        }

        const parsed = parseGithubPullRequestUrl(prUrl);
        if (!parsed) {
            throw new ParameterError('Could not parse the pull request URL');
        }

        // The PR URL is caller-supplied, so confirm it targets this project's
        // own repository before acting on it with the org installation token.
        const [configuredOwner, configuredRepo] = (
            project.dbtConnection as DbtGithubProjectConfig
        ).repository.split('/');
        if (
            !configuredOwner ||
            !configuredRepo ||
            configuredOwner.toLowerCase() !== parsed.owner.toLowerCase() ||
            configuredRepo.toLowerCase() !== parsed.repo.toLowerCase()
        ) {
            throw new ForbiddenError(
                'The pull request does not belong to this project',
            );
        }

        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                user.organizationUuid,
            );
        if (!installationId) {
            throw new ParameterError(
                'No GitHub app installation found for this organization',
            );
        }
        const token =
            await this.githubClient.getInstallationToken(installationId);

        return { ...parsed, token };
    }

    /**
     * Merge a write-back pull request. A write, so it requires
     * `manage:SourceCode` and surfaces failures (conflicts, blocked branch,
     * stale head) as thrown errors rather than degrading to null.
     */
    async mergePullRequest({
        user,
        projectUuid,
        prUrl,
        sha,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
        /** Expected head SHA; rejects the merge if the PR head has moved on. */
        sha?: string;
    }): Promise<MergePullRequestResult> {
        const { owner, repo, pullNumber, token } =
            await this.resolveWritePrContext({ user, projectUuid, prUrl });

        return this.githubClient.mergePullRequest({
            owner,
            repo,
            pullNumber,
            sha,
            token,
        });
    }

    /**
     * Close a write-back pull request without merging it. Also a write
     * (`manage:SourceCode`); reversible since the PR can be reopened on the
     * provider.
     */
    async closePullRequest({
        user,
        projectUuid,
        prUrl,
    }: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
    }): Promise<ClosePullRequestResult> {
        const { owner, repo, pullNumber, token } =
            await this.resolveWritePrContext({ user, projectUuid, prUrl });

        return this.githubClient.closePullRequest({
            owner,
            repo,
            pullNumber,
            token,
        });
    }
}
