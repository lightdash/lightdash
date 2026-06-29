import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isGitProjectType,
    isUserWithOrg,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    RequestMethod,
    SupportedDbtVersions,
    WarehouseTypes,
    type AiWritebackRunResult,
    type AiWritebackStep,
    type GitRepo,
    type MergePullRequestResult,
    type PullRequestWritebackAction,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import type {
    AiWritebackFailureStage,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import {
    getRepoDefaultBranch,
    getRepoTree,
    listReposAccessibleToInstallation,
    listReposAccessibleToUser,
} from '../../../clients/github/Github';
import { getGitlabProjects } from '../../../clients/gitlab/Gitlab';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GitlabAppInstallationsModel } from '../../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../../models/PullRequestsModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { BaseService } from '../../../services/BaseService';
import type { CiService } from '../../../services/CiService/CiService';
import type { GithubAppService } from '../../../services/GithubAppService/GithubAppService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type {
    AiWritebackThreadModel,
    ResumableWritebackThread,
} from '../../models/AiWritebackThreadModel';
import type { SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import {
    createSandboxManager,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxExpiredError,
    SandboxManager,
    SandboxTimeoutError,
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxSpec,
} from '../SandboxRuntime';
import {
    ALLOWED_TOOLS,
    CLAUDE_MODEL,
    CLAUDE_SKILLS_DIR,
    COMPILE_STRIPPED_ENV_VARS,
    COMPILE_TIMINGS_PATH,
    COMPILE_WRAPPER_PATH,
    CWD,
    GATHER_REPO_CONTEXT_SANDBOX_PATH,
    GIT_TIMEOUT_MS,
    PR_DESCRIPTION_PATH,
    PR_TITLE_PATH,
    PROMPT_PATH,
    REPO_CONTEXT_TIMEOUT_MS,
    RUN_TIMEOUT_MS,
    SANDBOX_TIMEOUT_MS,
    SHARED_SKILL_PATH,
    SKILLS_DIR,
    STDERR_TAIL_BYTES,
    SYSTEM_PROMPT_PATH,
    TMP_PROFILES_DIR,
    WAREHOUSE_SKILL_PATH,
} from './constants';
import {
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from './errors';
import { GithubProvider } from './providers/GithubProvider';
import { GitlabProvider } from './providers/GitlabProvider';
import type { GitProvider } from './providers/GitProvider';
import { buildGatherRepoContextScript } from './scripts';
import { loadWarehouseSkills, warehouseTypeToSkillKey } from './skills';
import { buildSystemPrompt } from './templates';
import type {
    AdoptedPullRequest,
    AiWritebackRunArgs,
    AiWritebackSource,
    AiWritebackUsage,
    AppliedChanges,
    CloneTarget,
    GitInstallation,
    SetStage,
    TurnContext,
    WarehouseSkillKey,
} from './types';
import {
    classifyToolStep,
    dbtSandboxVenvBin,
    extractPrMetadata,
    formatWritebackStep,
    interpretAgentEvent,
    parseGithubConnection,
    parseGitlabConnection,
    parsePullNumber,
    parsePullRequestUrl,
    progressTextForStage,
    resolvePrMetadataValue,
    resolveSandboxDbtVersion,
    resolveSandboxTemplateRef,
    splitStreamBuffer,
    summarizeToolInput,
} from './utils';

export type { AiWritebackRunArgs, AiWritebackSource } from './types';

// What to snapshot between turns: the whole cloned repo at CWD (working tree +
// .git feature branch + the agent's .claude session dir), minus re-derivable
// deps. Resume restores this tarball, so no re-clone is needed.
const WRITEBACK_WORKSPACE: PersistentWorkspace = {
    include: [CWD],
    exclude: ['node_modules'],
};

// Maps the applied-changes outcome to the PR action surfaced to the user: a
// fresh PR is 'opened', a resumed thread or adopted pasted-link PR is
// 'updated', and no PR touched is null.
const getPrAction = (
    applied: AppliedChanges,
): PullRequestWritebackAction | null => {
    if (!applied.prUrl) {
        return null;
    }
    return applied.prCreated ? 'opened' : 'updated';
};

type AiWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    githubAppService: GithubAppService;
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    aiWritebackThreadModel: AiWritebackThreadModel;
    sandboxRegistryModel: SandboxRegistryModel;
    pullRequestsModel: PullRequestsModel;
    prometheusMetrics?: PrometheusMetrics;
    ciService: CiService;
    projectService: ProjectService;
};

/** One repository in the source-code read union, plus the token that reads it. */
export type SourceCodeRepoAccess = {
    defaultBranch: string;
    private: boolean;
    token: string;
};

/**
 * Resolved read-only access to a project's dbt repo for the agent's `exploreRepo`
 * VFS, discriminated by `provider`. The `repoFs` layer creates the matching
 * {@link RepoSource} (GitHub Trees+Contents, or GitLab Trees+Files) from this.
 * GitLab adds `hostDomain` for self-hosted instances; GitHub has none.
 */
export type RepoReadAccess =
    | {
          provider: 'github';
          owner: string;
          repo: string;
          branch: string;
          token: string;
          subPath: string;
      }
    | {
          provider: 'gitlab';
          owner: string;
          repo: string;
          branch: string;
          token: string;
          hostDomain: string;
          subPath: string;
      };

type RepoListing = {
    owner: string;
    repo: string;
    defaultBranch: string;
    private: boolean;
};

/**
 * Merge the repositories the linked user can reach (read with their own token)
 * with the repositories the org installation can reach (read with the
 * installation token), keyed by `owner/repo`. The org installation is applied
 * last so it **wins on collision** — org-level access takes priority over the
 * user's personal access for the same repo. `userToken` undefined (user not
 * linked / feature off) yields the installation set only.
 */
export const mergeSourceCodeRepoAccess = (
    userRepos: RepoListing[],
    userToken: string | undefined,
    orgRepos: RepoListing[],
    installationToken: string,
): Map<string, SourceCodeRepoAccess> => {
    const map = new Map<string, SourceCodeRepoAccess>();
    if (userToken) {
        for (const r of userRepos) {
            map.set(`${r.owner}/${r.repo}`, {
                defaultBranch: r.defaultBranch,
                private: r.private,
                token: userToken,
            });
        }
    }
    for (const r of orgRepos) {
        map.set(`${r.owner}/${r.repo}`, {
            defaultBranch: r.defaultBranch,
            private: r.private,
            token: installationToken,
        });
    }
    return map;
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly aiWritebackThreadModel: AiWritebackThreadModel;

    private readonly sandboxRegistryModel: SandboxRegistryModel;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private readonly githubProvider: GithubProvider;

    private readonly gitlabProvider: GitlabProvider;

    private readonly githubAppService: GithubAppService;

    private readonly ciService: CiService;

    private readonly projectService: ProjectService;

    /** Memoized sandbox provider (e2b | docker), selected by SANDBOX_PROVIDER. */
    private sandboxManager: SandboxManager | undefined;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
        githubAppInstallationsModel,
        githubAppService,
        gitlabAppInstallationsModel,
        aiWritebackThreadModel,
        sandboxRegistryModel,
        pullRequestsModel,
        prometheusMetrics,
        ciService,
        projectService,
    }: AiWritebackServiceDeps) {
        super({ serviceName: 'AiWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.aiWritebackThreadModel = aiWritebackThreadModel;
        this.sandboxRegistryModel = sandboxRegistryModel;
        this.pullRequestsModel = pullRequestsModel;
        this.prometheusMetrics = prometheusMetrics;
        this.githubAppService = githubAppService;
        this.ciService = ciService;
        this.projectService = projectService;
        this.githubProvider = new GithubProvider({
            githubAppInstallationsModel,
            githubAppService,
            logger: this.logger,
        });
        this.gitlabProvider = new GitlabProvider({
            gitlabAppInstallationsModel,
            gitlabConfig: lightdashConfig.gitlab,
            logger: this.logger,
        });
    }

    /**
     * Merge a write-back PR, then auto-sync the dbt project so the merged
     * change goes live without a manual refresh. Delegates the merge itself to
     * {@link CiService} (which owns the PR write guard), and on a successful
     * merge schedules a recompile and fires the `ai_writeback.merged` event. The
     * agent is told the sync runs automatically via the post-merge follow-up
     * prompt, so it doesn't need to call `syncDbtProject` to kick one off.
     */
    async mergePullRequest(args: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
        sha?: string;
    }): Promise<MergePullRequestResult> {
        const result = await this.ciService.mergePullRequest(args);
        if (result.merged) {
            const compileScheduled = await this.scheduleCompileAfterMerge(
                args.user,
                args.projectUuid,
            );
            this.trackMerged(args.user, args.projectUuid, {
                prUrl: args.prUrl,
                mergeCommitSha: result.sha,
                compileScheduled,
            });
        }
        return result;
    }

    /**
     * Fire the `ai_writeback.merged` event after a successful merge. Best-effort
     * and self-contained: a successful merge is irreversible, so analytics never
     * throws back into the merge flow. Owner/repo/pullNumber are parsed from the
     * PR URL where possible (github.com links), and left null otherwise.
     */
    private trackMerged(
        user: SessionUser,
        projectUuid: string,
        properties: {
            prUrl: string;
            mergeCommitSha: string | null;
            compileScheduled: boolean;
        },
    ): void {
        let parsed: {
            owner: string;
            repo: string;
            pullNumber: number;
        } | null = null;
        try {
            parsed = parsePullRequestUrl(properties.prUrl);
        } catch {
            parsed = null;
        }
        this.analytics.track({
            event: 'ai_writeback.merged',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid ?? '',
                projectId: projectUuid,
                prUrl: properties.prUrl,
                owner: parsed?.owner ?? null,
                repo: parsed?.repo ?? null,
                pullNumber: parsed?.pullNumber ?? null,
                mergeCommitSha: properties.mergeCommitSha,
                compileScheduled: properties.compileScheduled,
            },
        });
    }

    /**
     * Schedule a dbt recompile after a write-back merge so the new/changed
     * fields land in the explores. Best-effort: the merge is irreversible, so a
     * scheduling failure is logged rather than thrown — a successful merge never
     * turns into an API error. Only git-connected projects re-clone on compile
     * and thus pick up the merged branch, so non-git projects are skipped.
     */
    private async scheduleCompileAfterMerge(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        try {
            const project = await this.projectModel.get(projectUuid);
            if (!isGitProjectType(project.dbtConnection)) {
                return false;
            }
            // skipPermissionCheck: the merge already passed the manage:SourceCode
            // guard, so this system-initiated recompile shouldn't fail for a user
            // who lacks the separate compile permission.
            const { jobUuid } =
                await this.projectService.scheduleCompileProject(
                    user,
                    projectUuid,
                    RequestMethod.BACKEND,
                    true,
                );
            this.logger.info(
                `Scheduled dbt compile (job ${jobUuid}) after writeback PR merge for project ${projectUuid}`,
            );
            return true;
        } catch (error) {
            this.logger.error(
                `Failed to schedule dbt compile after writeback PR merge for project ${projectUuid}: ${getErrorMessage(
                    error,
                )}`,
            );
            return false;
        }
    }

    /**
     * The single place writeback branches on the git host: map the dbt
     * connection type to its provider strategy. Everything downstream is
     * host-agnostic.
     */
    private getGitProvider(connectionType: DbtProjectType): GitProvider {
        if (connectionType === DbtProjectType.GITHUB) {
            return this.githubProvider;
        }
        if (connectionType === DbtProjectType.GITLAB) {
            return this.gitlabProvider;
        }
        throw new WritebackGitNotConnectedError(
            null,
            `AI writeback requires a GitHub or GitLab dbt connection, but this project uses "${connectionType}"`,
        );
    }

    /**
     * Resolve read-only access to the project's dbt repo — owner/repo/default
     * branch and an installation access token — for the repoShell virtual
     * filesystem. Reuses the same provider + installation resolution as
     * writeback but never creates a sandbox or clone. GitHub-only for now;
     * throws {@link WritebackGitNotConnectedError} for any other connection.
     */
    /**
     * Resolve the org's GitHub App installation for read-only source access,
     * gated by view:SourceCode. The dbt-independent core shared by
     * {@link getRepoReadAccess} (the dbt project repo) and
     * {@link getInstallationRepoReadAccess} (any accessible repo): org check →
     * view:SourceCode ability gate → installation token. GitHub-only for now.
     */
    /**
     * Org membership + view:SourceCode gate shared by every read-only source
     * access path, independent of git provider. Returns the project (so callers
     * can branch on its dbt connection type) and the org uuid (narrowed here).
     */
    private async assertSourceCodeAccess({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{
        project: Awaited<ReturnType<ProjectModel['get']>>;
        organizationUuid: string;
    }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const project = await this.projectModel.get(projectUuid);
        // Reading repo source requires view:SourceCode (writeback requires the
        // stricter manage:SourceCode). Gate the read so the explore/discover
        // tools can't expose source to users without source-code access.
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view this project source code',
            );
        }
        return { project, organizationUuid: user.organizationUuid };
    }

    private async resolveSourceCodeInstallation({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{
        installationId: string;
        token: string;
        project: Awaited<ReturnType<ProjectModel['get']>>;
    }> {
        const { project, organizationUuid } = await this.assertSourceCodeAccess(
            {
                user,
                projectUuid,
            },
        );
        const installation =
            await this.githubProvider.resolveInstallation(organizationUuid);
        if (installation.provider !== PullRequestProvider.GITHUB) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITHUB,
                'GitHub App is not installed for this organization',
            );
        }
        return {
            installationId: installation.installationId,
            token: installation.token,
            project,
        };
    }

    async getRepoReadAccess({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<RepoReadAccess> {
        const { project, organizationUuid } = await this.assertSourceCodeAccess(
            {
                user,
                projectUuid,
            },
        );
        const { dbtConnection } = project;

        // Scope the read-only VFS to the dbt project subdirectory so it can't
        // expose secrets/other files elsewhere in the repo. '.' (repo root)
        // means no scoping. Read the project's configured dbt branch so the
        // shell inspects the same source the Lightdash project compiles from.
        if (dbtConnection.type === DbtProjectType.GITHUB) {
            const installation =
                await this.githubProvider.resolveInstallation(organizationUuid);
            if (installation.provider !== PullRequestProvider.GITHUB) {
                throw new WritebackGitNotConnectedError(
                    PullRequestProvider.GITHUB,
                    'GitHub App is not installed for this organization',
                );
            }
            const connection = parseGithubConnection(dbtConnection);
            const branch =
                connection.branch ||
                (await getRepoDefaultBranch({
                    owner: connection.owner,
                    repo: connection.repo,
                    installationId: installation.installationId,
                }));
            return {
                provider: 'github',
                owner: connection.owner,
                repo: connection.repo,
                branch,
                token: installation.token,
                subPath: connection.projectSubPath,
            };
        }

        if (dbtConnection.type === DbtProjectType.GITLAB) {
            const installation =
                await this.gitlabProvider.resolveInstallation(organizationUuid);
            if (installation.provider !== PullRequestProvider.GITLAB) {
                throw new WritebackGitNotConnectedError(
                    PullRequestProvider.GITLAB,
                    'GitLab App is not installed for this organization',
                );
            }
            const connection = parseGitlabConnection(dbtConnection);
            // parseGitlabConnection omits the branch; read it from the typed
            // connection (GitLab dbt config always carries a branch).
            return {
                provider: 'gitlab',
                owner: connection.owner,
                repo: connection.repo,
                branch: dbtConnection.branch,
                token: installation.token,
                hostDomain: connection.hostDomain,
                subPath: connection.projectSubPath,
            };
        }

        throw new WritebackGitNotConnectedError(
            this.getGitProvider(dbtConnection.type).provider,
            'Repository read access is currently only supported for GitHub and GitLab dbt connections',
        );
    }

    /**
     * Generalized read-only access for the agent's repo discovery, gated by the
     * same view:SourceCode check as {@link getRepoReadAccess} but independent of
     * the project's dbt connection. Exposes the **union** of every repository the
     * agent can read: the org installation's repos (read with the installation
     * token) AND the repos the linked user can reach through their own GitHub
     * (read with the user token, via {@link GithubAppService.getValidUserToken} —
     * only when they've linked a personal account). Org installation access wins
     * on collision. Each repo carries the token that reads it, so the VFS uses
     * the right one per mount; whole-repo reads are guarded by the secrets
     * denylist in the GitHub RepoSource.
     *
     * `resolveRepoAccess` resolves a single repo's branch + token; for a repo
     * outside the discovered union (e.g. an explicitly targeted public repo) it
     * falls back to the installation token.
     */
    async getInstallationRepoReadAccess({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{
        installationId: string;
        installationToken: string;
        // The linked user's own GitHub token, if any — null when the
        // user-credentials feature is off or they haven't linked. Code search
        // is token-scoped, so the caller must search with this too or it misses
        // repos only the user (not the org installation) can reach.
        userToken: string | null;
        listRepos: () => Promise<
            {
                owner: string;
                repo: string;
                defaultBranch: string;
                private: boolean;
            }[]
        >;
        resolveRepoAccess: (
            owner: string,
            repo: string,
        ) => Promise<{ branch: string; token: string }>;
    }> {
        const { installationId, token: installationToken } =
            await this.resolveSourceCodeInstallation({ user, projectUuid });

        // The linked user's own GitHub token, if any, so the union also surfaces
        // repos accessible to THEM — not just the org installation. Undefined
        // when the user-credentials feature is off or they haven't linked.
        const userToken = isUserWithOrg(user)
            ? await this.githubAppService.getValidUserToken(
                  user.userUuid,
                  user.organizationUuid,
              )
            : undefined;

        // Build the union once per access object and memoise it — listRepos and
        // resolveRepoAccess share it, so the GitHub listing happens at most once.
        let repoMapPromise: Promise<Map<string, SourceCodeRepoAccess>> | null =
            null;
        const loadRepoMap = () => {
            if (!repoMapPromise) {
                repoMapPromise = (async () => {
                    let userRepos: RepoListing[] = [];
                    if (userToken) {
                        try {
                            userRepos = await listReposAccessibleToUser({
                                token: userToken,
                            });
                        } catch (error) {
                            // Degrade to org-only — a failed personal listing
                            // must never block reading the org's repos.
                            this.logger.warn(
                                `Failed to list user-accessible repos for source access: ${getErrorMessage(
                                    error,
                                )}`,
                            );
                        }
                    }
                    const orgRepos = await listReposAccessibleToInstallation({
                        installationId,
                    });
                    return mergeSourceCodeRepoAccess(
                        userRepos,
                        userToken,
                        orgRepos,
                        installationToken,
                    );
                })();
            }
            return repoMapPromise;
        };

        return {
            installationId,
            installationToken,
            userToken: userToken ?? null,
            listRepos: async () => {
                const map = await loadRepoMap();
                return [...map.entries()].map(([key, value]) => {
                    const slash = key.indexOf('/');
                    return {
                        owner: key.slice(0, slash),
                        repo: key.slice(slash + 1),
                        defaultBranch: value.defaultBranch,
                        private: value.private,
                    };
                });
            },
            resolveRepoAccess: async (owner, repo) => {
                const map = await loadRepoMap();
                const entry = map.get(`${owner}/${repo}`);
                if (entry) {
                    return { branch: entry.defaultBranch, token: entry.token };
                }
                // Outside the discovered union — fall back to the installation
                // token and fetch the default branch on demand.
                const branch = await getRepoDefaultBranch({
                    owner,
                    repo,
                    installationId,
                });
                return { branch, token: installationToken };
            },
        };
    }

    /**
     * GitLab analog of {@link getInstallationRepoReadAccess}: the repositories
     * the org's GitLab app install can read, for the `@`-mention picker and the
     * agent's repo VFS. GitLab has no per-user account linking yet (the install
     * acts as a single identity), so there's one token and no user/installation
     * union. Only two-segment `namespace/project` paths are listed — the mount
     * layer keys on `owner/repo` (as does the existing dbt-connection parsing),
     * so deeper subgroups are skipped until the mount model is generalised.
     */
    async getGitlabInstallationRepoReadAccess({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{
        token: string;
        hostDomain: string;
        listRepos: () => Promise<RepoListing[]>;
        resolveRepoAccess: (
            owner: string,
            repo: string,
        ) => Promise<{ branch: string; token: string }>;
    }> {
        const { project, organizationUuid } = await this.assertSourceCodeAccess(
            {
                user,
                projectUuid,
            },
        );
        if (project.dbtConnection.type !== DbtProjectType.GITLAB) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITLAB,
                'Project is not connected to GitLab',
            );
        }
        const installation =
            await this.gitlabProvider.resolveInstallation(organizationUuid);
        if (installation.provider !== PullRequestProvider.GITLAB) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITLAB,
                'GitLab App is not installed for this organization',
            );
        }
        const { token } = installation;
        const { hostDomain } = parseGitlabConnection(project.dbtConnection);
        // The GitLab client is split on host format: makeGitlabRequest-based
        // reads (createGitlabRepoSource) take a BARE domain and prepend https,
        // while getGitlabProjects takes a FULL instance URL. Derive both from
        // the connection's host_domain so gitlab.com and self-hosted both work.
        const bareHost = hostDomain.replace(/^https?:\/\//, '');
        const instanceUrl = `https://${bareHost}`;

        // Build the repo map once and memoise it — listRepos and
        // resolveRepoAccess share it, so the GitLab listing happens at most once.
        let repoMapPromise: Promise<Map<string, RepoListing>> | null = null;
        const loadRepoMap = () => {
            if (!repoMapPromise) {
                repoMapPromise = (async () => {
                    const projects = await getGitlabProjects(
                        token,
                        instanceUrl,
                    );
                    const map = new Map<string, RepoListing>();
                    projects.forEach(
                        (p: {
                            pathWithNamespace: string;
                            defaultBranch: string | null;
                            visibility: string;
                        }) => {
                            // The agent reads via the API path (path_with_namespace),
                            // not the display name. Only two-segment paths fit the
                            // owner/repo mount model; a project with no default
                            // branch (empty repo) can't be read.
                            const segments = p.pathWithNamespace.split('/');
                            if (segments.length !== 2 || !p.defaultBranch)
                                return;
                            const [owner, repo] = segments;
                            map.set(`${owner}/${repo}`, {
                                owner,
                                repo,
                                defaultBranch: p.defaultBranch,
                                private: p.visibility !== 'public',
                            });
                        },
                    );
                    return map;
                })();
            }
            return repoMapPromise;
        };

        return {
            token,
            hostDomain: bareHost,
            listRepos: async () => [...(await loadRepoMap()).values()],
            resolveRepoAccess: async (owner, repo) => {
                const entry = (await loadRepoMap()).get(`${owner}/${repo}`);
                if (!entry) {
                    throw new NotFoundError(
                        `GitLab repository ${owner}/${repo} is not accessible to this project's GitLab installation`,
                    );
                }
                return { branch: entry.defaultBranch, token };
            },
        };
    }

    /**
     * List the project's source files for the chat input's `@`-mention file
     * picker. Reuses the same gated, GitHub-only read access as repoShell, and
     * returns paths relative to the dbt sub-folder — the same root the agent's
     * repoShell sees — so a mentioned path is one the agent can act on directly.
     * Capped so a huge monorepo can't return an unbounded payload; the client
     * fetches once and filters as the user types.
     */
    async listProjectFiles({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{ files: string[]; truncated: boolean }> {
        const MAX_FILES = 1000;
        const access = await this.getRepoReadAccess({ user, projectUuid });
        const { files, truncated } = await getRepoTree({
            owner: access.owner,
            repo: access.repo,
            branch: access.branch,
            token: access.token,
        });

        const scoped =
            access.subPath && access.subPath !== '.'
                ? files
                      .filter((f) => f.path.startsWith(`${access.subPath}/`))
                      .map((f) => f.path.slice(access.subPath.length + 1))
                : files.map((f) => f.path);

        // Shorter (shallower) paths first — dbt models the user is likely to
        // reference live near the top — then alphabetical for stability.
        const sorted = scoped.sort(
            (a, b) => a.length - b.length || a.localeCompare(b),
        );

        return {
            files: sorted.slice(0, MAX_FILES),
            truncated: truncated || sorted.length > MAX_FILES,
        };
    }

    /**
     * List the repositories the agent can read, for the chat input's
     * `@`-mention repository picker. Returns the same union the agent's repo VFS
     * mounts — gated by the project's `view:SourceCode` ability via
     * {@link getInstallationRepoReadAccess} — so a user without source-code
     * access can't enumerate repo names (unlike the org-wide
     * `/github/repos/list` endpoint).
     */
    async listProjectRepositories({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<GitRepo[]> {
        const { project } = await this.assertSourceCodeAccess({
            user,
            projectUuid,
        });
        const isGitlab = project.dbtConnection.type === DbtProjectType.GITLAB;
        const access = isGitlab
            ? await this.getGitlabInstallationRepoReadAccess({
                  user,
                  projectUuid,
              })
            : await this.getInstallationRepoReadAccess({ user, projectUuid });
        const repos = await access.listRepos();
        return repos.map(({ owner, repo, defaultBranch }) => ({
            name: repo,
            ownerLogin: owner,
            fullName: `${owner}/${repo}`,
            defaultBranch,
            provider: isGitlab ? 'gitlab' : 'github',
        }));
    }

    private async assertEnabled(
        user: SessionUser,
        source: AiWritebackSource,
    ): Promise<void> {
        if (source === 'admin_review') {
            return;
        }
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiWriteback,
        });
        if (!enabled) {
            throw new ForbiddenError('AI writeback is not enabled');
        }
    }

    /**
     * The sandbox manager over the provider selected by `SANDBOX_PROVIDER`
     * (e2b | docker). Memoized — the feature talks only to the manager for
     * lifecycle and to the returned {@link SandboxHandle} for the data plane.
     * See SandboxRuntime/DESIGN.md.
     */
    private getSandboxManager(): SandboxManager {
        if (!this.sandboxManager) {
            this.sandboxManager = createSandboxManager({
                provider: this.lightdashConfig.appRuntime.sandboxProvider,
                e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
                dockerImage:
                    this.lightdashConfig.appRuntime
                        .sandboxAiWritebackDockerImage,
                lambdaMicroVm: this.lightdashConfig.appRuntime.lambdaMicroVm,
                // Object-store snapshots are Docker-only; native-pause providers
                // never touch S3, so don't construct a client for them.
                snapshotStore:
                    this.lightdashConfig.appRuntime.sandboxProvider === 'docker'
                        ? new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          })
                        : null,
                registryModel: this.sandboxRegistryModel,
                logger: this.logger,
                idleTimeoutMs:
                    this.lightdashConfig.appRuntime.sandboxIdleTimeoutMs,
                snapshotRetentionMs:
                    this.lightdashConfig.appRuntime.sandboxSnapshotRetentionMs,
            });
        }
        return this.sandboxManager;
    }

    private buildSandboxSpec(): SandboxSpec {
        return {
            templateRef: this.getSandboxTemplateRef(),
            timeoutMs: SANDBOX_TIMEOUT_MS,
            egress: {
                allow: ['api.anthropic.com', 'github.com', 'gitlab.com'],
            },
        };
    }

    /**
     * Resolve the template/image ref the active provider launches from. E2B
     * composes the writeback `name:tag`; Docker uses the writeback-specific
     * local image (separate from the data-app image — different toolchain).
     */
    private getSandboxTemplateRef(): string {
        const { sandboxProvider } = this.lightdashConfig.appRuntime;
        if (sandboxProvider === 'docker') {
            return this.lightdashConfig.appRuntime
                .sandboxAiWritebackDockerImage;
        }
        if (sandboxProvider === 'lambda-microvm') {
            const imageArn =
                this.lightdashConfig.appRuntime
                    .lambdaMicroVmAiWritebackImageArn;
            if (!imageArn) {
                throw new MissingConfigError(
                    'Lambda MicroVM AI writeback image ARN is not configured (LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN)',
                );
            }
            return imageArn;
        }
        return resolveSandboxTemplateRef({
            name: this.lightdashConfig.appRuntime.e2bAiWritebackTemplateName,
            tag: this.lightdashConfig.appRuntime.e2bAiWritebackTemplateTag,
        });
    }

    private getAnthropicApiKey(): string {
        const key = this.lightdashConfig.aiWriteback.anthropicApiKey;
        if (!key) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (AI_WRITEBACK_ANTHROPIC_API_KEY)',
            );
        }
        return key;
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    private async createSandbox(
        organizationUuid: string,
        projectUuid: string,
    ): Promise<{
        sandboxUuid: string;
        sandbox: SandboxHandle;
        durationMs: number;
    }> {
        const start = performance.now();
        const spec = this.buildSandboxSpec();
        const { sandboxUuid, handle } = await this.getSandboxManager().acquire({
            spec,
            organizationUuid,
            projectUuid,
            workspace: WRITEBACK_WORKSPACE,
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info('AI writeback sandbox created', {
            event: 'ai_writeback.sandbox.created',
            sandboxId: handle.sandboxId,
            sandboxUuid,
            projectUuid,
            template: spec.templateRef,
            durationMs,
        });
        this.prometheusMetrics?.observeAiWritebackSandboxCreateDuration(
            durationMs,
        );
        return { sandboxUuid, sandbox: handle, durationMs };
    }

    /**
     * End-of-turn suspend: snapshot the workspace and (on object-store
     * backends) destroy the container. Best-effort — a pause failure is logged
     * but never fails the run.
     */
    private async suspendSandbox(
        sandboxUuid: string,
        sandbox: SandboxHandle,
        projectUuid: string,
    ): Promise<void> {
        try {
            const start = performance.now();
            await this.getSandboxManager().suspend({
                sandboxUuid,
                handle: sandbox,
                workspace: WRITEBACK_WORKSPACE,
            });
            const durationMs = AiWritebackService.elapsed(start);
            this.logger.info('AI writeback sandbox suspended', {
                event: 'ai_writeback.sandbox.lifecycle',
                action: 'paused',
                sandboxId: sandbox.sandboxId,
                sandboxUuid,
                projectUuid,
                durationMs,
            });
        } catch (error) {
            this.logger.warn('AI writeback failed to suspend sandbox', {
                event: 'ai_writeback.sandbox.pause_failed',
                sandboxId: sandbox.sandboxId,
                sandboxUuid,
                projectUuid,
                errorMessage: getErrorMessage(error),
            });
        }
    }

    private async resumeSandbox(
        sandboxUuid: string,
        projectUuid: string,
    ): Promise<{ sandbox: SandboxHandle; durationMs: number }> {
        const start = performance.now();
        const sandbox = await this.getSandboxManager().resume({
            sandboxUuid,
            spec: this.buildSandboxSpec(),
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info('AI writeback sandbox resumed', {
            event: 'ai_writeback.sandbox.lifecycle',
            action: 'resumed',
            sandboxId: sandbox.sandboxId,
            sandboxUuid,
            projectUuid,
            durationMs,
        });
        this.prometheusMetrics?.observeAiWritebackSandboxCreateDuration(
            durationMs,
        );
        return { sandbox, durationMs };
    }

    /** Read a file the agent may or may not have written; null if absent. */
    private static async readFileOrNull(
        sandbox: SandboxHandle,
        path: string,
    ): Promise<string | null> {
        try {
            return await sandbox.files.read(path);
        } catch {
            return null;
        }
    }

    /**
     * Resolve a PR-metadata value (title/description) the agent was asked to
     * leave in /tmp. The agent has been observed writing these into the repo
     * root instead, which (a) makes the host fall back to a generic title/body
     * and (b) lets `git add --all` sweep the scratch file into the PR. So we
     * also accept a repo-root copy as a fallback, and ALWAYS delete that copy
     * so it can never reach the commit. Returns `fallback` if neither source
     * has content. Logs which source won so the leak fix is provable from the
     * logs alone (tmp = agent wrote correctly; repo = fallback recovered it and
     * the stray file was scrubbed; default = agent wrote nothing usable).
     */
    private async resolvePrMetadata(
        sandbox: SandboxHandle,
        tmpPath: string,
        fallback: string,
    ): Promise<string> {
        const fileName = tmpPath.split('/').pop() ?? '';
        const repoPath = `${CWD}/${fileName}`;
        const [fromTmp, fromRepo] = await Promise.all([
            AiWritebackService.readFileOrNull(sandbox, tmpPath),
            AiWritebackService.readFileOrNull(sandbox, repoPath),
        ]);
        if (fromRepo !== null) {
            await sandbox.files.remove(repoPath).catch(() => {});
        }
        const { source, value } = resolvePrMetadataValue({
            fromTmp,
            fromRepo,
            fallback,
        });
        this.logger.info(
            `AiWriteback: resolved PR metadata '${fileName}' from ${source}` +
                `${
                    source === 'repo-fallback'
                        ? ' (scrubbed stray repo copy so it cannot be committed)'
                        : ''
                } (sandboxId=${sandbox.sandboxId})`,
        );
        return value;
    }

    /**
     * Synchronously run a writeback turn through the Claude Code CLI and a
     * PR against the project's GitHub repo.
     *
     * - **One-shot** (no `aiThreadUuid`): create a fresh sandbox, clone, run
     *   the agent, open a PR if there are changes, then kill the sandbox.
     * - **First conversational turn** (`aiThreadUuid` provided, no row): same
     *   as one-shot, but if a PR is opened the sandbox is paused (rather than
     *   killed) and an `ai_writeback_thread` row is recorded for resume.
     * - **Follow-up turn** (`aiThreadUuid` matches an existing row): resume
     *   the stored sandbox (repo + branch already checked out, prior Claude
     *   session preserved), run the agent with `--continue`, push to the same
     *   branch (updates the existing PR), pause the sandbox again.
     */
    async run(args: AiWritebackRunArgs): Promise<AiWritebackRunResult> {
        const {
            user,
            projectUuid,
            prompt,
            prUrl,
            aiThreadUuid,
            source,
            onProgress,
        } = args;
        const runStartedAt = performance.now();

        // Ordered, structured log of every step (stages + per-file actions),
        // persisted as the writeback step rows so the post-reload view matches
        // what was shown live. Consecutive duplicates are suppressed.
        const stepLog: AiWritebackStep[] = [];
        // Wrap the optional onProgress in a try/catch so a misbehaving caller
        // (e.g. a Slack `chat.update` 429 that wasn't caught upstream) can
        // never take down the writeback run itself. Progress is best-effort.
        const reportProgress = (message: string): void => {
            if (!onProgress) return;
            try {
                onProgress(message);
            } catch (error) {
                this.logger.debug(
                    `AiWriteback: onProgress threw — ignoring: ${getErrorMessage(error)}`,
                );
            }
        };
        // Record one structured step: dedup against the previous, persist it,
        // and stream its one-line form for live progress (Slack/web).
        const recordStep = (step: AiWritebackStep): void => {
            const text = formatWritebackStep(step);
            const last = stepLog[stepLog.length - 1];
            if (last && formatWritebackStep(last) === text) return;
            stepLog.push(step);
            reportProgress(text);
        };

        const turn = await this.prepareTurn({
            user,
            projectUuid,
            aiThreadUuid,
            source,
        });

        this.logger.info('AI writeback run started', {
            event: 'ai_writeback.run.started',
            source,
            projectUuid,
            aiThreadUuid: aiThreadUuid ?? null,
            isResume: turn.isResume,
            warehouseType: turn.warehouseType,
        });

        const repository = `${turn.gitConnection.owner}/${turn.gitConnection.repo}`;

        const tracker = this.startTracking({ user, projectUuid, turn });

        let failureStage: AiWritebackFailureStage = 'install';
        let stageStartedAt = Date.now();
        const setStage: SetStage = (stage) => {
            const now = Date.now();
            // Log every transition so a run reads as a timeline in the logs and
            // a stall is immediately attributable to the stage it happened in.
            this.logger.info('AI writeback stage complete', {
                event: 'ai_writeback.run.stage',
                source,
                aiThreadUuid: aiThreadUuid ?? null,
                stage: failureStage,
                nextStage: stage,
                durationMs: now - stageStartedAt,
            });
            this.prometheusMetrics?.observeAiWritebackStageDuration(
                failureStage,
                now - stageStartedAt,
            );
            failureStage = stage;
            stageStartedAt = now;
            // Stages can opt out of progress reporting by returning null
            // from progressTextForStage when their label would duplicate
            // the parent tool's heading or otherwise add no signal.
            const progressText = progressTextForStage(stage);
            if (progressText !== null) {
                recordStep({ kind: 'stage', label: progressText });
            }
        };

        let sandbox: SandboxHandle | undefined;
        let sandboxUuid: string | undefined;
        // Default to preserving a resumed sandbox through failures — its
        // sandbox_uuid is referenced by an ai_writeback_thread row and killing
        // it would poison the row for every future turn. Fresh turns have no
        // such row, so the default kill is fine.
        let pauseOnExit = turn.isResume;
        try {
            const installation = await turn.provider.resolveInstallation(
                turn.organizationUuid,
                { user, connection: turn.gitConnection },
            );

            const adoptedPr =
                !turn.existingRow && prUrl
                    ? await turn.provider.adoptPullRequest({
                          prUrl,
                          connection: turn.gitConnection,
                          installation,
                      })
                    : null;

            ({ sandbox, sandboxUuid } = await this.acquireSandbox({
                organizationUuid: turn.organizationUuid,
                projectUuid,
                cloneTarget: turn.provider.getCloneTarget(
                    turn.gitConnection,
                    installation,
                ),
                existingRow: turn.existingRow,
                adoptBranch: adoptedPr?.headRef ?? null,
                setStage,
            }));

            setStage('agent');
            const repoContext = await this.gatherRepoContext(
                sandbox,
                turn.gitConnection.projectSubPath,
            );
            // Stage a credential-free profiles copy host-side so the agent
            // doesn't burn turns discovering profiles.yml and hand-stripping
            // Jinja (mkdir + cp + edit). Deterministic string work — no reason
            // to spend LLM round-trips on it.
            const profilesStaged = await this.prepareProfiles(
                sandbox,
                turn.gitConnection.projectSubPath,
            );
            const skillKey = warehouseTypeToSkillKey(turn.warehouseType);
            const systemPrompt = buildSystemPrompt(
                turn.gitConnection.projectSubPath,
                {
                    projectName: turn.projectName,
                    repository,
                    repoContext,
                    warehouseType: turn.warehouseType,
                    hasWarehouseSkill: skillKey !== null,
                    profilesStaged,
                },
            );
            const agent = await this.runAgentInSandbox({
                sandbox,
                systemPrompt,
                prompt,
                isResume: turn.isResume,
                source,
                recordStep,
                skillKey,
                warehouseType: turn.warehouseType,
                dbtVersion: turn.dbtVersion,
            });

            const {
                title: prTitle,
                description: prDescription,
                summary: prSummary,
                sanitizedStdout,
            } = extractPrMetadata(agent.stdout);
            this.logger.info(
                `AiWriteback: extracted PR metadata from stdout (title=${
                    prTitle !== null
                }, description=${prDescription !== null})`,
            );

            const { hasChanges } = await sandbox.git.status(CWD);

            // The agent crashed mid-run. The working tree may be in a
            // partial/inconsistent state, so skip the push/PR side-effects
            // and surface the failure to the caller.
            if (agent.exitCode !== 0) {
                this.logger.warn(
                    'AI writeback agent exited non-zero, skipping PR',
                    {
                        event: 'ai_writeback.run.failed',
                        source,
                        projectUuid,
                        aiThreadUuid: aiThreadUuid ?? null,
                        sandboxId: sandbox.sandboxId,
                        failureStage,
                        exitCode: agent.exitCode,
                        errorMessage: 'Agent CLI exited non-zero',
                        warehouseType: turn.warehouseType,
                        totalDurationMs: Math.round(
                            performance.now() - runStartedAt,
                        ),
                    },
                );
                tracker.completed({
                    exitCode: agent.exitCode,
                    hasChanges,
                    prCreated: false,
                    usage: agent.usage,
                });
                const crashPrUrl =
                    turn.existingRow?.pr_url ?? adoptedPr?.prUrl ?? null;
                return {
                    output: sanitizedStdout,
                    exitCode: agent.exitCode,
                    prUrl: crashPrUrl,
                    // The agent crashed before pushing changes, so any PR here
                    // is a pre-existing one — never newly opened, and this turn
                    // pushed no commit to pin to.
                    prAction: crashPrUrl ? 'updated' : null,
                    commitSha: null,
                    additions: null,
                    deletions: null,
                    projectName: turn.projectName,
                    repository,
                    steps: stepLog,
                };
            }

            const applied = await this.applyAgentChanges({
                sandbox,
                sandboxUuid,
                installation,
                hasChanges,
                adoptedPr,
                turn,
                user,
                projectUuid,
                aiThreadUuid,
                setStage,
                prTitle,
                prDescription,
                prSummary,
            });
            pauseOnExit = applied.pauseOnExit;

            tracker.completed({
                exitCode: agent.exitCode,
                hasChanges,
                prCreated: applied.prCreated,
                usage: agent.usage,
            });

            this.logger.info('AI writeback run completed', {
                event: 'ai_writeback.run.completed',
                source,
                projectUuid,
                aiThreadUuid: aiThreadUuid ?? null,
                sandboxId: sandbox.sandboxId,
                isResume: turn.isResume,
                exitCode: agent.exitCode,
                hasChanges,
                prCreated: applied.prCreated,
                prUrl: applied.prUrl ?? null,
                warehouseType: turn.warehouseType,
                totalDurationMs: Math.round(performance.now() - runStartedAt),
            });
            this.prometheusMetrics?.observeAiWritebackRunDuration(
                performance.now() - runStartedAt,
                'success',
            );

            return {
                output: sanitizedStdout,
                exitCode: agent.exitCode,
                prUrl: applied.prUrl,
                prAction: getPrAction(applied),
                commitSha: applied.commitSha,
                additions: applied.additions,
                deletions: applied.deletions,
                projectName: turn.projectName,
                repository,
                steps: stepLog,
            };
        } catch (error) {
            this.logger.error('AI writeback run failed', {
                event: 'ai_writeback.run.failed',
                source,
                projectUuid,
                aiThreadUuid: aiThreadUuid ?? null,
                sandboxId: sandbox?.sandboxId ?? null,
                failureStage,
                errorMessage: getErrorMessage(error),
                warehouseType: turn.warehouseType,
                totalDurationMs: Math.round(performance.now() - runStartedAt),
            });
            this.prometheusMetrics?.observeAiWritebackRunDuration(
                performance.now() - runStartedAt,
                'error',
            );
            Sentry.captureException(error, {
                tags: {
                    errorType: 'AiWritebackRunFailed',
                    failureStage,
                },
                extra: {
                    projectUuid,
                    aiThreadUuid: aiThreadUuid ?? null,
                    sandboxId: sandbox?.sandboxId ?? null,
                },
            });
            tracker.failed(failureStage, error);
            throw error;
        } finally {
            if (sandbox && sandboxUuid) {
                await this.releaseSandbox(
                    sandboxUuid,
                    sandbox,
                    pauseOnExit,
                    projectUuid,
                );
            }
        }
    }

    /**
     * Pre-flight: enforce source-specific rollout gates, the
     * `manage:SourceCode` permission, and resolve everything from the request
     * that doesn't require a sandbox.
     */
    private async prepareTurn({
        user,
        projectUuid,
        aiThreadUuid,
        source,
    }: {
        user: SessionUser;
        projectUuid: string;
        aiThreadUuid: string | undefined;
        source: AiWritebackSource;
    }): Promise<TurnContext> {
        await this.assertEnabled(user, source);

        const project = await this.projectModel.get(projectUuid);
        // Writeback opens a PR from a freshly created feature branch
        // (`lightdash-ai-writeback/<uuid>`), so `isProtectedBranch: false`
        // mirrors the gate on GitIntegrationService's PR-creating paths.
        const canWriteback = this.createAuditedAbility(user).can(
            'manage',
            subject('SourceCode', {
                organizationUuid: project.organizationUuid,
                projectUuid,
                isProtectedBranch: false,
            }),
        );
        if (!canWriteback) {
            throw new ForbiddenError();
        }

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        // Resolve the git host once; the rest of the run stays host-agnostic.
        const provider = this.getGitProvider(project.dbtConnection.type);
        const gitConnection = provider.resolveConnection(project.dbtConnection);

        // Resume only when both the caller supplied a thread uuid AND we
        // have a stored sandbox for it. Otherwise we start fresh.
        const storedRow = aiThreadUuid
            ? await this.aiWritebackThreadModel.findByAiThreadUuid(aiThreadUuid)
            : null;
        // A null `sandbox_uuid` means an old pod inserted this row mid-rollout
        // (it set the legacy `sandbox_id` column the new code no longer reads),
        // so there's no resumable registry sandbox. Clear the stale row and
        // start fresh rather than carry an unresumable pointer.
        if (storedRow && storedRow.sandbox_uuid === null) {
            await this.aiWritebackThreadModel.deleteByAiThreadUuid(
                storedRow.ai_thread_uuid,
            );
        }
        const existingRow =
            storedRow && storedRow.sandbox_uuid !== null
                ? { ...storedRow, sandbox_uuid: storedRow.sandbox_uuid }
                : null;

        // A thread is bound to its first PR. If that PR has since been merged or
        // closed (from the chat card or directly on the host), editing it again
        // would push onto a dead branch and silently orphan the change. Bail
        // before spinning up the sandbox and tell the user to start a new
        // thread. (Pasted-link turns are validated separately in adoptPullRequest.)
        if (existingRow?.pr_url) {
            const installation = await provider.resolveInstallation(
                user.organizationUuid,
                { user, connection: gitConnection },
            );
            const editState = await provider.getPullRequestEditState({
                prUrl: existingRow.pr_url,
                connection: gitConnection,
                installation,
            });
            if (!editState.editable && editState.reason) {
                throw new WritebackThreadPrClosedError(editState.reason);
            }
        }

        // `get()` returns the (de-sensitised) warehouse credentials with the
        // discriminant `type` intact. Null when the project has no warehouse
        // connection — the agent then gets `shared.md` only.
        const warehouseType = project.warehouseConnection?.type ?? null;

        // Resolve to a concrete, sandbox-installed version here so downstream
        // (the compile wrapper's PATH prefix) always maps to an installed venv:
        // `latest` becomes the newest version and pins older than the supported
        // range clamp up. Never re-resolved downstream.
        const dbtVersion = resolveSandboxDbtVersion(project.dbtVersion);

        return {
            organizationUuid: user.organizationUuid,
            projectName: project.name,
            provider,
            gitConnection,
            existingRow,
            isResume: existingRow !== null,
            warehouseType,
            dbtVersion,
        };
    }

    /**
     * Fire the `ai_writeback.started` event and return bound `completed` /
     * `failed` closures so the inline analytics calls stay out of `run()`.
     */
    private startTracking({
        user,
        projectUuid,
        turn,
    }: {
        user: SessionUser;
        projectUuid: string;
        turn: TurnContext;
    }) {
        const eventBase = {
            organizationId: turn.organizationUuid,
            projectId: projectUuid,
            owner: turn.gitConnection.owner,
            repo: turn.gitConnection.repo,
            isResume: turn.isResume,
        };
        const startedAt = Date.now();

        this.analytics.track({
            event: 'ai_writeback.started',
            userId: user.userUuid,
            properties: eventBase,
        });

        return {
            completed: (props: {
                exitCode: number;
                hasChanges: boolean;
                prCreated: boolean;
                usage: AiWritebackUsage | null;
            }) =>
                this.analytics.track({
                    event: 'ai_writeback.completed',
                    userId: user.userUuid,
                    properties: {
                        ...eventBase,
                        exitCode: props.exitCode,
                        hasChanges: props.hasChanges,
                        prCreated: props.prCreated,
                        totalDurationMs: Date.now() - startedAt,
                        costUsd: props.usage?.costUsd ?? null,
                        inputTokens: props.usage?.inputTokens ?? null,
                        outputTokens: props.usage?.outputTokens ?? null,
                        cacheReadInputTokens:
                            props.usage?.cacheReadInputTokens ?? null,
                        cacheCreationInputTokens:
                            props.usage?.cacheCreationInputTokens ?? null,
                        numTurns: props.usage?.numTurns ?? null,
                        durationApiMs: props.usage?.durationApiMs ?? null,
                    },
                }),
            failed: (stage: AiWritebackFailureStage, error: unknown) =>
                this.analytics.track({
                    event: 'ai_writeback.failed',
                    userId: user.userUuid,
                    properties: {
                        ...eventBase,
                        failureStage: stage,
                        errorMessage: getErrorMessage(error),
                        totalDurationMs: Date.now() - startedAt,
                    },
                }),
        };
    }

    /**
     * Return a running sandbox with the repo present at `CWD`. Resume the
     * stored sandbox when an existing conversation row is provided; otherwise
     * create a fresh sandbox and clone the repo into it. When `adoptBranch` is
     * set, the fresh clone checks out that branch (the pasted PR's head) so the
     * agent edits on top of the existing PR.
     */
    private async acquireSandbox({
        organizationUuid,
        projectUuid,
        cloneTarget,
        existingRow,
        adoptBranch,
        setStage,
    }: {
        organizationUuid: string;
        projectUuid: string;
        cloneTarget: CloneTarget;
        existingRow: ResumableWritebackThread | null;
        adoptBranch: string | null;
        setStage: SetStage;
    }): Promise<{ sandbox: SandboxHandle; sandboxUuid: string }> {
        setStage('sandbox');

        if (existingRow) {
            try {
                const { sandbox } = await this.resumeSandbox(
                    existingRow.sandbox_uuid,
                    projectUuid,
                );
                return { sandbox, sandboxUuid: existingRow.sandbox_uuid };
            } catch (error) {
                // The persisted sandbox is gone (snapshot GC'd, reaped, or some
                // other permanent failure). GC the dead registry row and clear
                // the conversation row so the next turn starts fresh instead of
                // looping on the same dead reference.
                this.logger.warn(
                    `AiWriteback: failed to resume sandbox ${existingRow.sandbox_uuid} — clearing conversation row (ai_thread_uuid=${existingRow.ai_thread_uuid}): ${getErrorMessage(error)}`,
                );
                if (!(error instanceof SandboxExpiredError)) {
                    await this.getSandboxManager().destroy({
                        sandboxUuid: existingRow.sandbox_uuid,
                    });
                }
                await this.aiWritebackThreadModel.deleteByAiThreadUuid(
                    existingRow.ai_thread_uuid,
                );
                throw new ParameterError(
                    'This writeback conversation has expired. Please start a new one.',
                );
            }
        }

        const { sandbox, sandboxUuid } = await this.createSandbox(
            organizationUuid,
            projectUuid,
        );

        setStage('clone');
        // Clone over HTTPS with the access token as the password (provider-
        // built target). `depth: 1` keeps the clone shallow (we only need the
        // tip to branch off) and `timeoutMs` overrides the E2B SDK's 60s
        // default, which a slow clone was exceeding with `deadline_exceeded`.
        const cloneStartedAt = Date.now();
        await sandbox.git.clone(cloneTarget.url, {
            path: CWD,
            username: cloneTarget.username,
            password: cloneTarget.password,
            depth: 1,
            timeoutMs: GIT_TIMEOUT_MS,
            ...(adoptBranch ? { branch: adoptBranch } : {}),
        });
        this.logger.info(
            `AiWriteback: repo cloned (sandboxId=${sandbox.sandboxId}, ${
                Date.now() - cloneStartedAt
            }ms)`,
        );
        return { sandbox, sandboxUuid };
    }

    /**
     * Stage a warehouse-credential-free `profiles.yml` copy at
     * {@link TMP_PROFILES_DIR} so the in-sandbox agent can compile without
     * discovering the profiles file, copying it, and hand-stripping Jinja —
     * deterministic plumbing that otherwise costs several LLM turns. Strips
     * every `{{ … }}` expression (env_var lookups, filters) to a literal so dbt
     * parses without any environment variables. Returns true when staged;
     * false (best-effort) leaves the agent's prompt fallback in place.
     */
    private async prepareProfiles(
        sandbox: SandboxHandle,
        projectSubPath: string,
    ): Promise<boolean> {
        const start = performance.now();
        try {
            const base =
                projectSubPath === '.' ? CWD : `${CWD}/${projectSubPath}`;
            const found = await sandbox.commands.run(
                `find ${base} -maxdepth 2 -name profiles.yml 2>/dev/null | head -1`,
                { cwd: CWD },
            );
            const profilesPath = found.stdout.trim();
            if (!profilesPath) {
                this.logger.info(
                    'AI writeback prepareProfiles: no profiles.yml found — agent will prepare it',
                    { event: 'ai_writeback.profiles.skipped', projectSubPath },
                );
                return false;
            }
            const raw = await sandbox.files.read(profilesPath);
            // Replace each Jinja expression with a literal so the copy needs no
            // env vars. Existing surrounding quotes (`"{{ … }}"`) wrap the
            // placeholder; bare expressions become a plain scalar.
            const patched = raw.replace(/\{\{.*?\}\}/g, 'placeholder');
            await sandbox.commands.run(`mkdir -p ${TMP_PROFILES_DIR}`, {
                cwd: CWD,
            });
            await sandbox.files.write(
                `${TMP_PROFILES_DIR}/profiles.yml`,
                patched,
            );
            this.logger.info(
                `AI writeback profiles staged (${AiWritebackService.elapsed(
                    start,
                )}ms, from ${profilesPath})`,
                {
                    event: 'ai_writeback.profiles.staged',
                    sandboxId: sandbox.sandboxId,
                },
            );
            return true;
        } catch (error) {
            this.logger.warn(
                `AI writeback prepareProfiles failed — agent will prepare it: ${getErrorMessage(
                    error,
                )}`,
                { event: 'ai_writeback.profiles.failed' },
            );
            return false;
        }
    }

    /**
     * Pre-compute a dbt project snapshot (project file, file tree, models/
     * YAML) so the agent doesn't burn turns rediscovering them. Returns null
     * on any failure — the run continues without the context block.
     */
    private async gatherRepoContext(
        sandbox: SandboxHandle,
        projectSubPath: string,
    ): Promise<string | null> {
        const start = performance.now();
        try {
            await sandbox.files.write(
                GATHER_REPO_CONTEXT_SANDBOX_PATH,
                buildGatherRepoContextScript(projectSubPath),
            );
            const result = await sandbox.commands.run(
                `bash ${GATHER_REPO_CONTEXT_SANDBOX_PATH}`,
                {
                    cwd: CWD,
                    timeoutMs: REPO_CONTEXT_TIMEOUT_MS,
                },
            );
            if (result.exitCode !== 0) {
                this.logger.warn(
                    `AiWriteback: gatherRepoContext exited non-zero (exit=${result.exitCode}) — running without context`,
                );
                return null;
            }
            const bytes = Buffer.byteLength(result.stdout, 'utf8');
            this.logger.info(
                `AiWriteback: repo context gathered (sandboxId=${sandbox.sandboxId}, bytes=${bytes}, ${AiWritebackService.elapsed(start)}ms)`,
            );
            return result.stdout;
        } catch (error) {
            this.logger.warn(
                `AiWriteback: gatherRepoContext failed — running without context: ${getErrorMessage(error)}`,
            );
            return null;
        }
    }

    /**
     * Write the system + user prompts to disk and pipe the user prompt into
     * the Claude Code CLI. On resume, `--continue` picks up the most recent
     * Claude session in `CWD` (preserved across pause/resume on the sandbox
     * filesystem).
     *
     * Prompts are written to files — rather than passed as arguments — so
     * arbitrary content (quotes, newlines, shell metacharacters) can't break
     * the command line.
     */
    private async runAgentInSandbox({
        sandbox,
        systemPrompt,
        prompt,
        isResume,
        source,
        recordStep,
        skillKey,
        warehouseType,
        dbtVersion,
    }: {
        sandbox: SandboxHandle;
        systemPrompt: string;
        prompt: string;
        isResume: boolean;
        source: AiWritebackSource;
        recordStep: (step: AiWritebackStep) => void;
        skillKey: WarehouseSkillKey | null;
        warehouseType: WarehouseTypes | null;
        dbtVersion: SupportedDbtVersions;
    }): Promise<{
        stdout: string;
        exitCode: number;
        usage: AiWritebackUsage | null;
    }> {
        await sandbox.files.write(SYSTEM_PROMPT_PATH, systemPrompt);
        await sandbox.files.write(PROMPT_PATH, prompt);

        // Install the compile wrapper. The agent runs ${COMPILE_WRAPPER_PATH}
        // (allowlisted) instead of `lightdash compile` directly, and the wrapper
        // drops secrets from the environment before exec'ing the real CLI — so a
        // malicious dbt model in the checkout cannot read them via Jinja
        // `env_var(...)` during the compile. `exec` keeps the process tree flat;
        // the `unset` list is fixed (no interpolation of untrusted input).
        const unsetFlags = COMPILE_STRIPPED_ENV_VARS.map(
            (name) => `-u ${name}`,
        ).join(' ');
        // Prepend the project's dbt-version venv bin to PATH so the bare `dbt`
        // the Lightdash CLI invokes resolves to the version the project is
        // configured to use (the image installs every supported version in its
        // own venv). `lightdash` still resolves via the inherited PATH. This is
        // the only place `dbt` runs — the agent is allowlisted to this wrapper.
        const dbtBin = dbtSandboxVenvBin(dbtVersion);
        // Time each compile and append `<elapsedMs> <exitCode>` to a log we read
        // after the run. We drop `exec` (one extra shell frame) so the timing
        // can be recorded after the child returns; secrets are still stripped via
        // `env -u` for the compile child, so the security property is unchanged.
        await sandbox.files.write(
            COMPILE_WRAPPER_PATH,
            `#!/usr/bin/env bash\n` +
                `__ld_start=$(date +%s%3N)\n` +
                `env ${unsetFlags} PATH="${dbtBin}:$PATH" lightdash compile "$@"\n` +
                `__ld_code=$?\n` +
                `echo "$(( $(date +%s%3N) - __ld_start )) $__ld_code" >> ${COMPILE_TIMINGS_PATH}\n` +
                `exit $__ld_code\n`,
        );
        await sandbox.commands.run(`chmod +x ${COMPILE_WRAPPER_PATH}`);
        // Reset the timings log each turn — the sandbox filesystem persists across
        // pause/resume, so a resumed turn would otherwise double-count prior runs.
        await sandbox.files.write(COMPILE_TIMINGS_PATH, '');

        // Push the warehouse skill files alongside the prompts. `shared.md`
        // always; the dialect file only when one exists for this warehouse.
        // The system prompt points the agent here before any `type:`/SQL edit.
        const skills = await loadWarehouseSkills(skillKey);
        await sandbox.files.write(SHARED_SKILL_PATH, skills.shared);
        if (skills.warehouse !== null) {
            await sandbox.files.write(WAREHOUSE_SKILL_PATH, skills.warehouse);
        }

        // Run state folded from Claude Code's stream-json output. The final
        // assistant message wins for `assistantText` — it carries the
        // user-facing reply and the PR_TITLE/PR_DESCRIPTION blocks.
        let buffer = '';
        let assistantText = '';
        // Token/turn/cost usage from the run's `result` event, captured so the
        // caller can attach it to the `ai_writeback.completed` analytics event.
        let agentUsage: AiWritebackUsage | null = null;
        const toolCounts: Record<string, number> = {};

        let stderrTail = '';
        const appendStderrTail = (chunk: string) => {
            stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
        };

        const handleEvent = (event: unknown): void => {
            const interpreted = interpretAgentEvent(event);
            if (interpreted.type === 'result') {
                // `durationMs` is the agent's total wall-clock; `durationApiMs`
                // is the LLM-call portion, so `durationMs - durationApiMs`
                // approximates time spent in local tool execution (edits, git,
                // and `lightdash compile`). A large gap points at compile/IO
                // rather than model latency.
                const localToolMs =
                    interpreted.durationMs !== null &&
                    interpreted.durationApiMs !== null
                        ? interpreted.durationMs - interpreted.durationApiMs
                        : null;
                agentUsage = {
                    costUsd: interpreted.costUsd,
                    inputTokens: interpreted.inputTokens,
                    outputTokens: interpreted.outputTokens,
                    cacheReadInputTokens: interpreted.cacheReadInputTokens,
                    cacheCreationInputTokens:
                        interpreted.cacheCreationInputTokens,
                    numTurns: interpreted.numTurns,
                    durationApiMs: interpreted.durationApiMs,
                };
                this.logger.info(
                    `AI writeback agent run summary (wall=${
                        interpreted.durationMs ?? '?'
                    }ms, api=${interpreted.durationApiMs ?? '?'}ms, local=${
                        localToolMs ?? '?'
                    }ms, turns=${interpreted.numTurns ?? '?'}, cost=$${
                        interpreted.costUsd ?? '?'
                    }, in=${interpreted.inputTokens ?? '?'}, out=${
                        interpreted.outputTokens ?? '?'
                    }, cacheRead=${
                        interpreted.cacheReadInputTokens ?? '?'
                    }, tools=${JSON.stringify(toolCounts)})`,
                    {
                        event: 'ai_writeback.run.summary',
                        source,
                        sandboxId: sandbox.sandboxId,
                        costUsd: interpreted.costUsd,
                        durationMs: interpreted.durationMs,
                        durationApiMs: interpreted.durationApiMs,
                        localToolMs,
                        numTurns: interpreted.numTurns,
                        inputTokens: interpreted.inputTokens,
                        outputTokens: interpreted.outputTokens,
                        cacheReadInputTokens: interpreted.cacheReadInputTokens,
                        cacheCreationInputTokens:
                            interpreted.cacheCreationInputTokens,
                        warehouseType,
                        toolCounts,
                    },
                );
                return;
            }
            if (interpreted.type === 'ignored') return;
            for (const toolCall of interpreted.toolCalls) {
                toolCounts[toolCall.name] =
                    (toolCounts[toolCall.name] ?? 0) + 1;
                this.logger.info('AI writeback agent tool call', {
                    event: 'ai_writeback.run.tool',
                    source,
                    sandboxId: sandbox.sandboxId,
                    toolName: toolCall.name,
                    summary: summarizeToolInput(toolCall.input),
                });
                // Surface the actual file the agent is touching ("Editing
                // fm_parts.yml", "Reading orders.yml") rather than a generic
                // phase, deduped so a repeated step doesn't spam the UI.
                const step = classifyToolStep(toolCall);
                if (step) {
                    recordStep(step);
                }
            }
            if (interpreted.text !== null) assistantText = interpreted.text;
        };

        const flushBuffer = (): void => {
            const { lines, remainder } = splitStreamBuffer(buffer);
            buffer = remainder;
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        handleEvent(JSON.parse(line));
                    } catch {
                        this.logger.debug(
                            `AiWriteback: unparseable claude line: ${line.slice(0, 200)}`,
                        );
                    }
                }
            }
        };

        const continueFlag = isResume ? '--continue ' : '';
        let result;
        try {
            result = await sandbox.commands.run(
                `cat ${PROMPT_PATH} | claude -p ${continueFlag}` +
                    `--model ${CLAUDE_MODEL} ` +
                    `--append-system-prompt-file ${SYSTEM_PROMPT_PATH} ` +
                    // stream-json emits one event per line on stdout (assistant
                    // messages, tool_use blocks, tool_results, final cost summary).
                    // --verbose is required by the CLI when combining -p with
                    // stream-json output.
                    '--output-format stream-json --verbose ' +
                    // Claude Code confines Write/Edit to the cwd workspace, so the
                    // agent cannot write the PR metadata to /tmp (it silently falls
                    // back to the repo root) unless /tmp is an added directory.
                    // The skills dir is outside the repo too, so it likewise needs
                    // to be added or the agent's Read of warehouse.md is refused.
                    // CLAUDE_SKILLS_DIR holds the installed Agent Skills, added for
                    // the same reason — the agent reads their resource files from there.
                    `--add-dir /tmp --add-dir ${SKILLS_DIR} --add-dir ${CLAUDE_SKILLS_DIR} ` +
                    `--allowedTools "${ALLOWED_TOOLS}"`,
                {
                    cwd: CWD,
                    timeoutMs: RUN_TIMEOUT_MS,
                    envs: { ANTHROPIC_API_KEY: this.getAnthropicApiKey() },
                    onStdout: (chunk) => {
                        buffer += chunk;
                        flushBuffer();
                    },
                    onStderr: (chunk) => {
                        appendStderrTail(chunk);
                        this.logger.debug(
                            `AiWriteback: claude stderr: ${chunk.trimEnd()}`,
                        );
                    },
                },
            );
        } catch (error) {
            // The provider shim throws SandboxTimeoutError when RUN_TIMEOUT_MS
            // fires, and SandboxCommandError when the claude subprocess returns
            // a non-zero exit code. Both reach Sentry as the bare message ("exit
            // status 1") with no stderr — useless for debugging. Capture here so
            // the rich context (timeout flag, exit code, stderr tail) is attached
            // before the error bubbles up to the outer wrapSentryTransaction
            // catch (Sentry's Dedupe integration collapses the two events).
            const timedOut = error instanceof SandboxTimeoutError;
            const exitCode =
                error instanceof SandboxCommandError ? error.exitCode : null;
            // Prefer the error's stderr (the shim attaches the command's stderr
            // to SandboxCommandError) and fall back to our streamed tail; both
            // are clipped to STDERR_TAIL_BYTES so the payload stays small.
            const errStderr =
                error instanceof SandboxCommandError
                    ? (error.stderr ?? '')
                    : '';
            const stderrSnippet = (errStderr || stderrTail).slice(
                -STDERR_TAIL_BYTES,
            );
            this.logger.error('AI writeback agent subprocess failed', {
                event: 'ai_writeback.run.agent_failed',
                sandboxId: sandbox.sandboxId,
                isResume,
                timedOut,
                runTimeoutMs: RUN_TIMEOUT_MS,
                exitCode,
                errorMessage: getErrorMessage(error),
                stderrTail: stderrSnippet || null,
            });
            Sentry.captureException(error, {
                tags: {
                    errorType: 'AiWritebackAgentSubprocessFailed',
                    timedOut: String(timedOut),
                },
                extra: {
                    sandboxId: sandbox.sandboxId,
                    isResume,
                    runTimeoutMs: RUN_TIMEOUT_MS,
                    exitCode,
                    stderrTail: stderrSnippet,
                    toolCounts,
                },
            });
            throw error;
        }
        // A final line may remain in the buffer if the command output didn't
        // end with a newline (common on timeouts/aborts) — try to parse it but
        // don't fail the run if it's truncated.
        if (buffer.trim()) {
            try {
                handleEvent(JSON.parse(buffer));
            } catch {
                this.logger.debug(
                    `AiWriteback: unparseable trailing claude line: ${buffer.slice(0, 200)}`,
                );
            }
            buffer = '';
        }
        this.logger.info('AI writeback agent CLI exited', {
            event: 'ai_writeback.run.agent_exited',
            sandboxId: sandbox.sandboxId,
            exitCode: result.exitCode,
            isResume,
        });

        // Report how much of the agent stage went to `lightdash compile` (each
        // invocation timed by the wrapper) — the prime suspect for writeback
        // latency. Best-effort: never fail the run over a missing timings file.
        try {
            const timings = await sandbox.commands.run(
                `cat ${COMPILE_TIMINGS_PATH} 2>/dev/null || true`,
                { cwd: CWD },
            );
            const runs = timings.stdout
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => {
                    const [ms, code] = line.split(/\s+/);
                    return { ms: Number(ms), exitCode: Number(code) };
                })
                .filter((run) => Number.isFinite(run.ms));
            if (runs.length > 0) {
                const compileTotalMs = runs.reduce(
                    (sum, run) => sum + run.ms,
                    0,
                );
                const compileFailures = runs.filter(
                    (run) => run.exitCode !== 0,
                ).length;
                this.logger.info(
                    `AI writeback compile timings (count=${
                        runs.length
                    }, total=${compileTotalMs}ms, runs=[${runs
                        .map((run) => run.ms)
                        .join(',')}]ms, failures=${compileFailures})`,
                    {
                        event: 'ai_writeback.run.compile',
                        sandboxId: sandbox.sandboxId,
                        compileCount: runs.length,
                        compileTotalMs,
                        compileMs: runs.map((run) => run.ms),
                        compileFailures,
                    },
                );
                runs.forEach((run) => {
                    this.prometheusMetrics?.observeAiWritebackCompileDuration(
                        run.ms,
                        run.exitCode === 0 ? 'success' : 'error',
                    );
                });
            }
        } catch (error) {
            this.logger.debug(
                `AiWriteback: failed to read compile timings: ${getErrorMessage(
                    error,
                )}`,
            );
        }

        return {
            stdout: assistantText,
            exitCode: result.exitCode,
            usage: agentUsage,
        };
    }

    /**
     * Translate the agent's effect on the working tree into the right
     * pull/merge request side-effect (delegated to the resolved provider) and
     * decide whether the sandbox should outlive this turn. Three branches, no
     * nesting:
     *
     * 1. No changes — nothing to push. Existing request (if any) is the answer;
     *    keep the sandbox warm only when resuming.
     * 2. Resume or adopted + changes — land onto the checked-out branch and
     *    refresh the existing request.
     * 3. Fresh + changes — branch, land, open a new request; persist the
     *    conversation row if the caller supplied an `aiThreadUuid`.
     */
    private async applyAgentChanges({
        sandbox,
        sandboxUuid,
        installation,
        hasChanges,
        adoptedPr,
        turn,
        user,
        projectUuid,
        aiThreadUuid,
        setStage,
        prTitle,
        prDescription,
        prSummary,
    }: {
        sandbox: SandboxHandle;
        sandboxUuid: string;
        installation: GitInstallation;
        hasChanges: boolean;
        adoptedPr: AdoptedPullRequest | null;
        turn: TurnContext;
        user: SessionUser;
        projectUuid: string;
        aiThreadUuid: string | undefined;
        setStage: SetStage;
        prTitle: string | null;
        prDescription: string | null;
        prSummary: string | null;
    }): Promise<AppliedChanges> {
        if (!hasChanges) {
            this.logger.info(
                `AiWriteback: no file changes — skipping PR (sandboxId=${sandbox.sandboxId})`,
            );
            return {
                prUrl: turn.existingRow?.pr_url ?? adoptedPr?.prUrl ?? null,
                prCreated: false,
                pauseOnExit: turn.isResume,
                // No file changes this turn → no commit to pin the card to.
                commitSha: null,
                additions: null,
                deletions: null,
            };
        }

        // Resume or pasted-link adoption: land onto the existing request's
        // branch (the sandbox is already on it) and refresh its title/body.
        if (turn.existingRow || adoptedPr) {
            const targetPrUrl = turn.existingRow?.pr_url ?? adoptedPr?.prUrl;
            if (!targetPrUrl) {
                throw new ParameterError(
                    'Cannot update pull request: the writeback thread is not linked to a pull request',
                );
            }
            const { commitSha, additions, deletions } =
                await turn.provider.updatePullRequest({
                    sandbox,
                    connection: turn.gitConnection,
                    installation,
                    prUrl: targetPrUrl,
                    title: await this.resolvePrTitle(sandbox, prTitle, true),
                    description: await this.resolvePrDescription(
                        sandbox,
                        prDescription,
                        true,
                    ),
                    user,
                    setStage,
                });
            this.logger.info(
                `AiWriteback: updated PR ${targetPrUrl} (sandboxId=${sandbox.sandboxId})`,
            );

            // A pasted PR has no thread row yet — record it so the project's
            // "Pull requests" view lists it and later turns resume in place.
            if (adoptedPr) {
                await this.recordWritebackPullRequest({
                    turn,
                    projectUuid,
                    user,
                    aiThreadUuid,
                    sandboxUuid,
                    prUrl: targetPrUrl,
                    summary: prSummary,
                });
            }

            return {
                prUrl: targetPrUrl,
                prCreated: false,
                pauseOnExit: turn.existingRow
                    ? true
                    : aiThreadUuid !== undefined,
                commitSha,
                additions,
                deletions,
            };
        }

        const { prUrl, commitSha, additions, deletions } =
            await turn.provider.openPullRequest({
                sandbox,
                connection: turn.gitConnection,
                installation,
                title: await this.resolvePrTitle(sandbox, prTitle, false),
                description: await this.resolvePrDescription(
                    sandbox,
                    prDescription,
                    false,
                ),
                user,
                setStage,
            });
        this.logger.info(
            `AiWriteback: opened PR ${prUrl} (sandboxId=${sandbox.sandboxId})`,
        );

        await this.recordWritebackPullRequest({
            turn,
            projectUuid,
            user,
            aiThreadUuid,
            sandboxUuid,
            prUrl,
            summary: prSummary,
        });

        return {
            prUrl,
            prCreated: true,
            pauseOnExit: aiThreadUuid !== undefined,
            commitSha,
            additions,
            deletions,
        };
    }

    /**
     * Resolve the request title. Prefer the structured-output value parsed from
     * the agent's stdout; fall back to the file-based channel (and finally a
     * generic default) only when the agent failed to emit the structured block.
     * Provider-independent, so the provider receives a final string.
     */
    private resolvePrTitle(
        sandbox: SandboxHandle,
        prTitle: string | null,
        isUpdate: boolean,
    ): Promise<string> {
        if (prTitle !== null) return Promise.resolve(prTitle);
        return this.resolvePrMetadata(
            sandbox,
            PR_TITLE_PATH,
            isUpdate ? 'AI writeback follow-up' : 'AI writeback changes',
        );
    }

    private resolvePrDescription(
        sandbox: SandboxHandle,
        prDescription: string | null,
        isUpdate: boolean,
    ): Promise<string> {
        if (prDescription !== null) return Promise.resolve(prDescription);
        return this.resolvePrMetadata(
            sandbox,
            PR_DESCRIPTION_PATH,
            isUpdate
                ? 'Follow-up changes from the Lightdash AI writeback agent.'
                : 'Changes generated by the Lightdash AI writeback agent.',
        );
    }

    // Record the PR in the project's "Pull requests" view and link it to the
    // thread so later turns resume in place. findOrCreate dedupes an adopted PR.
    private async recordWritebackPullRequest({
        turn,
        projectUuid,
        user,
        aiThreadUuid,
        sandboxUuid,
        prUrl,
        summary,
    }: {
        turn: TurnContext;
        projectUuid: string;
        user: SessionUser;
        aiThreadUuid: string | undefined;
        sandboxUuid: string;
        prUrl: string;
        summary: string | null;
    }): Promise<void> {
        const pullRequest = await this.pullRequestsModel.findOrCreate({
            organizationUuid: turn.organizationUuid,
            projectUuid,
            createdByUserUuid: user.userUuid,
            provider: turn.provider.provider,
            source: PullRequestSource.AI_AGENT,
            owner: turn.gitConnection.owner,
            repo: turn.gitConnection.repo,
            prNumber: parsePullNumber(prUrl),
            prUrl,
            summary,
        });

        if (aiThreadUuid) {
            await this.aiWritebackThreadModel.create({
                aiThreadUuid,
                sandboxUuid,
                pullRequestUuid: pullRequest.pullRequestUuid,
            });
        }
    }

    /**
     * Final sandbox disposition. Suspend (snapshot + pause/destroy) to preserve
     * it for the next turn, or destroy (with a soft-fail log) to free resources
     * and GC the snapshot for non-resumable runs.
     */
    private async releaseSandbox(
        sandboxUuid: string,
        sandbox: SandboxHandle,
        shouldPause: boolean,
        projectUuid: string,
    ): Promise<void> {
        if (shouldPause) {
            await this.suspendSandbox(sandboxUuid, sandbox, projectUuid);
            return;
        }
        // destroy() is a no-op if the sandbox is already gone and never throws
        // for that, but guard the whole call so cleanup can't fail the run.
        try {
            await this.getSandboxManager().destroy({
                sandboxUuid,
                handle: sandbox,
            });
        } catch (error) {
            this.logger.warn(
                `AiWriteback: failed to destroy sandbox ${sandbox.sandboxId}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }
}
