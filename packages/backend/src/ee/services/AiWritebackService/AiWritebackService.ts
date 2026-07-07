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
    type AiWritebackDbtSourceOption,
    type AiWritebackRunResult,
    type AiWritebackStep,
    type ClosePullRequestResult,
    type DbtProjectConfig,
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
    getRepoMetadata,
    getRepoTree,
    getScopedRepoCloneToken,
    listReposAccessibleToInstallation,
    listReposAccessibleToUser,
    revokeInstallationToken,
} from '../../../clients/github/Github';
import {
    getGitlabProjects,
    getRepositorySizeMb as getGitlabRepositorySizeMb,
} from '../../../clients/gitlab/Gitlab';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GitlabAppInstallationsModel } from '../../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import type { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../../models/PullRequestsModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { BaseService } from '../../../services/BaseService';
import type { CiService } from '../../../services/CiService/CiService';
import type { GithubAppService } from '../../../services/GithubAppService/GithubAppService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type {
    AiWritebackThreadModel,
    AiWritebackThreadWithPrUrl,
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
    type AzureSandboxesConfig,
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
    GENERAL_ALLOWED_TOOLS,
    GENERAL_DISALLOWED_TOOLS,
    GENERAL_SKILLS_DIR,
    GIT_TIMEOUT_MS,
    MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD,
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
import { DeniedPathError } from './deniedPaths';
import {
    RepoTooLargeError,
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from './errors';
import { GithubProvider } from './providers/GithubProvider';
import { GitlabProvider } from './providers/GitlabProvider';
import type { GitProvider } from './providers/GitProvider';
import { buildGatherRepoContextScript } from './scripts';
import { loadWarehouseSkills, warehouseTypeToSkillKey } from './skills';
import { buildGeneralSystemPrompt, buildSystemPrompt } from './templates';
import type {
    AdoptedPullRequest,
    AiWritebackRunArgs,
    AiWritebackSource,
    AiWritebackUsage,
    AppliedChanges,
    CloneTarget,
    CodingAgentConfig,
    GitConnection,
    GitInstallation,
    ResolvedTurnTarget,
    SetStage,
    TurnContext,
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

/**
 * Outcome of `prepareTurn`: either a turn ready to run, or — when the project
 * has several dbt sources and the prompt didn't name one — a request for the
 * caller to choose which source to target.
 */
type PreparedTurn =
    | { kind: 'run'; turn: TurnContext }
    | {
          kind: 'select';
          projectName: string;
          options: AiWritebackDbtSourceOption[];
      };

/** A dbt source a writeback run can target, with its decrypted connection. */
type DbtTargetCandidate = {
    /** `project_dbt_sources` row uuid for an additional source; null for primary. */
    sourceUuid: string | null;
    /** Client-facing id: the project uuid for primary, the row uuid otherwise. */
    optionUuid: string;
    name: string;
    isPrimary: boolean;
    connection: DbtProjectConfig;
};

type AiWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
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

/**
 * Repositories the coding agent must NEVER write, regardless of installation or
 * user access (kept lowercase; compared case-insensitively). Lightdash's own
 * repo is hard-denied so the org installation can't be turned against it.
 */
export const DENYLISTED_WRITE_REPOS = new Set(['lightdash/lightdash']);

/** Parse a `owner/repo` target; throws {@link ParameterError} if malformed. */
export const parseOwnerRepo = (
    repoTarget: string | undefined,
): { owner: string; repo: string } => {
    const trimmed = (repoTarget ?? '').trim().replace(/\.git$/, '');
    const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
    if (!match) {
        throw new ParameterError(
            `Invalid repository target "${repoTarget ?? ''}". Expected "owner/repo".`,
        );
    }
    return { owner: match[1], repo: match[2] };
};

/**
 * The single predicate behind both the writable-repo list flag and the
 * {@link AiWritebackService.resolveWritableRepoTarget} chokepoint — they MUST
 * agree or the picker offers repos the backend then 403s (R5). A repo is
 * writable when the org installation can reach it (the app holds contents:write)
 * AND — when the user has linked a personal GitHub — they can reach it too
 * (user-intersection, R1). Unlinked users fall back to the installation scope,
 * gated by manage:SourceCode on the project. Denylisted repos are never
 * writable.
 */
export const computeWritableRepoKeys = (
    installationRepos: { owner: string; repo: string }[],
    userRepos: { owner: string; repo: string }[],
    intersectWithUser: boolean,
): Set<string> => {
    // GitHub/GitLab repo slugs are case-insensitive, and the installation vs
    // user listings can disagree on case — compare lowercased so the
    // intersection never falsely drops a permitted repo. Output keys keep the
    // installation's original case (the picker matches against the same source).
    const userKeys = new Set(
        userRepos.map((r) => `${r.owner}/${r.repo}`.toLowerCase()),
    );
    return new Set(
        installationRepos
            .map((r) => `${r.owner}/${r.repo}`)
            .filter((key) => !DENYLISTED_WRITE_REPOS.has(key.toLowerCase()))
            .filter(
                (key) => !intersectWithUser || userKeys.has(key.toLowerCase()),
            ),
    );
};

/**
 * Classify a coding-agent failure into a stable audit `reason` category that
 * distinguishes the conditions decision #2 requires (user-intersection /
 * installation / branch-protection / denied-repo / denied-path / size). Keyword
 * matching on the ForbiddenError sub-cases is acceptable for an audit log.
 */
export const auditReasonForError = (error: unknown): string => {
    if (error instanceof DeniedPathError) return 'denied_path';
    if (error instanceof RepoTooLargeError) return 'repo_too_large';
    if (error instanceof WritebackGitNotConnectedError) return 'not_installed';
    if (error instanceof WritebackThreadPrClosedError) return 'pr_not_open';
    if (error instanceof ForbiddenError) {
        const message = error.message.toLowerCase();
        if (message.includes('cannot be edited')) return 'denied_repo';
        if (message.includes('linked github')) return 'user_intersection';
        if (message.includes('installation')) return 'installation';
        if (message.includes('organization')) return 'no_org';
        return 'permission';
    }
    if (error instanceof ParameterError) return 'invalid_target';
    return 'unknown';
};

/**
 * The concurrency key for a turn: the resolved workstream (resuming the same PR
 * serializes) or `new::repo` for a fresh turn (so an accidental double-open of
 * the same repo still serializes). Null for one-shots (no thread).
 */
export const workstreamLockKey = (
    aiThreadUuid: string | undefined,
    turn: Pick<TurnContext, 'existingRow'>,
    repository: string,
): string | null => {
    if (!aiThreadUuid) return null;
    return turn.existingRow
        ? `${aiThreadUuid}::ws::${turn.existingRow.ai_writeback_thread_uuid}`
        : `${aiThreadUuid}::new::${repository}`;
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly projectDbtSourcesModel: ProjectDbtSourcesModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly aiWritebackThreadModel: AiWritebackThreadModel;

    private readonly sandboxRegistryModel: SandboxRegistryModel;

    // In-flight WORKSTREAM lock keys, so a second concurrent turn on the same
    // workstream (one sandbox + one PR) is rejected rather than racing the first.
    // Distinct workstreams — different PRs, even on the same repo — run in
    // parallel. SINGLE-INSTANCE, BEST-EFFORT ONLY: this is an in-process Set, so a
    // horizontally-scaled backend relies on the chat UI serializing turns per
    // thread. The partial unique index is keyed on (ai_thread_uuid,
    // pull_request_uuid) — it does NOT prevent two concurrent fresh turns for the
    // same (thread, repo) on different pods from each opening a distinct PR (each
    // gets a different pull_request_uuid, so both inserts satisfy the index). The
    // worst case is a benign duplicate PR (no data loss / security hole); a DB
    // advisory lock or a (thread, target_repo) unique is the cross-pod fix (H1).
    // Cleared in the run's finally.
    private readonly inFlightWorkstreams = new Set<string>();

    // Count of in-flight coding-agent turns per thread, so the per-workstream
    // parallelism above can't spin up an unbounded number of concurrent
    // sandboxes from one conversation (MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD).
    // Single-instance only. Decremented in the run's finally.
    private readonly inFlightTurnsByThread = new Map<string, number>();

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
        projectDbtSourcesModel,
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
        this.projectDbtSourcesModel = projectDbtSourcesModel;
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
     * Close a write-back PR without merging it, so the coding agent can retire a
     * pull request it opened (e.g. after folding its change elsewhere).
     *
     * The general coding agent opens PRs in any repo the user∩installation can
     * write — NOT just the project's dbt repo — so we cannot delegate blindly to
     * {@link CiService}, whose close path ties the URL to the project's dbt
     * connection and would reject ("does not belong to this project") any
     * workstream in another repo. Instead we resolve the URL back to the
     * `pull_requests` row linked to this thread's workstream, re-check
     * `manage:SourceCode`, and close it through that workstream's own provider.
     *
     * A URL with no recorded project row falls back to the CiService path, which
     * fails closed unless the URL is this project's own dbt-repo PR. A URL
     * recorded in the project but not this thread is denied. Reversible.
     */
    async closePullRequest(args: {
        user: SessionUser;
        projectUuid: string;
        aiThreadUuid: string;
        prUrl: string;
    }): Promise<ClosePullRequestResult> {
        const { user, projectUuid, aiThreadUuid, prUrl } = args;
        const recorded = await this.pullRequestsModel.findByAiThreadUuidAndUrl(
            aiThreadUuid,
            prUrl,
        );
        if (!recorded) {
            const projectPr = await this.pullRequestsModel.findByProjectAndUrl(
                projectUuid,
                prUrl,
            );
            if (projectPr) {
                throw new ForbiddenError(
                    'This pull request is not a workstream in the current conversation',
                );
            }
            return this.ciService.closePullRequest({
                user,
                projectUuid,
                prUrl,
            });
        }
        if (recorded.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'This pull request does not belong to the current project',
            );
        }

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const project = await this.projectModel.get(projectUuid);
        this.assertCanManageSourceCode(user, project, projectUuid);

        const provider =
            recorded.provider === PullRequestProvider.GITLAB
                ? this.gitlabProvider
                : this.githubProvider;
        const installation = await provider.resolveInstallation(
            user.organizationUuid,
        );
        return provider.closePullRequest({
            prUrl: recorded.prUrl,
            owner: recorded.owner,
            repo: recorded.repo,
            pullNumber: recorded.prNumber,
            installation,
        });
    }

    /**
     * Read-only: the raw unified diff of a pull request in the project's repo.
     * Lets the top agent see exactly what a PR contains before deciding how to
     * split, consolidate, or continue changes across pull requests. Delegates to
     * {@link CiService.getPullRequestDiff} — the same path the chat's diff viewer
     * uses — which checks `view:SourceCode` and confirms the URL targets the
     * project's own repository, so it can't read arbitrary repos the
     * installation happens to cover. Returns null when the diff can't be
     * resolved (wrong repo, no installation, unparseable URL).
     */
    async getPullRequestDiff(args: {
        user: SessionUser;
        projectUuid: string;
        prUrl: string;
    }): Promise<string | null> {
        const { user, projectUuid, prUrl } = args;
        return this.ciService.getPullRequestDiff({
            user,
            projectUuid,
            prUrl,
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
     *
     * Each repo carries a `writable` flag from the SAME predicate the editRepo
     * authz chokepoint uses ({@link computeWritableRepoKeys}), so the picker can
     * disable repos the backend would 403 (R5). GitLab uses a single install
     * identity (no user-intersection), so every listed repo is writable bar the
     * denylist.
     *
     * The flag is advisory/display-only (L4): it is computed under view:SourceCode
     * while a write needs manage:SourceCode, and on a transient user-listing
     * failure it degrades to installation scope (more permissive). That drift is
     * SAFE because {@link resolveWritableRepoTarget} is the authoritative gate and
     * fails CLOSED on the same failure — at worst the picker shows a repo as
     * writable that the backend then refuses.
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

        if (project.dbtConnection.type === DbtProjectType.GITLAB) {
            const access = await this.getGitlabInstallationRepoReadAccess({
                user,
                projectUuid,
            });
            const repos = await access.listRepos();
            const writableKeys = computeWritableRepoKeys(
                repos.map((r) => ({ owner: r.owner, repo: r.repo })),
                [],
                // GitLab: single install identity, no user-intersection.
                false,
            );
            return repos.map(({ owner, repo, defaultBranch }) => ({
                name: repo,
                ownerLogin: owner,
                fullName: `${owner}/${repo}`,
                defaultBranch,
                provider: 'gitlab',
                writable: writableKeys.has(`${owner}/${repo}`),
            }));
        }

        // GitHub: list installation + user repos once, build the read union for
        // display and the writable set (installation ∩ user) from the same data.
        const { installationId } = await this.resolveSourceCodeInstallation({
            user,
            projectUuid,
        });
        const userToken = isUserWithOrg(user)
            ? await this.githubAppService.getValidUserToken(
                  user.userUuid,
                  user.organizationUuid,
              )
            : undefined;
        const installationRepos = await listReposAccessibleToInstallation({
            installationId,
        });
        let intersectWithUser = Boolean(userToken);
        let userRepos: {
            owner: string;
            repo: string;
            defaultBranch: string;
            private: boolean;
        }[] = [];
        if (userToken) {
            try {
                userRepos = await listReposAccessibleToUser({
                    token: userToken,
                });
            } catch (error) {
                intersectWithUser = false;
                this.logger.warn(
                    `AiCodingAgent: user repo listing failed in picker — degrading writable flags to installation scope: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        }

        const writableKeys = computeWritableRepoKeys(
            installationRepos,
            userRepos,
            intersectWithUser,
        );

        // Read union for display (installation ∪ user), deduped by owner/repo.
        const union = new Map<
            string,
            { owner: string; repo: string; defaultBranch: string }
        >();
        for (const r of [...installationRepos, ...userRepos]) {
            union.set(`${r.owner}/${r.repo}`, {
                owner: r.owner,
                repo: r.repo,
                defaultBranch: r.defaultBranch,
            });
        }

        return [...union.values()].map(({ owner, repo, defaultBranch }) => ({
            name: repo,
            ownerLogin: owner,
            fullName: `${owner}/${repo}`,
            defaultBranch,
            provider: 'github',
            writable: writableKeys.has(`${owner}/${repo}`),
        }));
    }

    private async assertEnabled(
        user: SessionUser,
        source: AiWritebackSource,
        featureFlag: FeatureFlags,
    ): Promise<void> {
        if (source === 'admin_review') {
            return;
        }
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: featureFlag,
        });
        if (!enabled) {
            throw new ForbiddenError(
                featureFlag === FeatureFlags.CodingAgent
                    ? 'AI coding agent is not enabled'
                    : 'AI writeback is not enabled',
            );
        }
    }

    /**
     * The sandbox manager over the provider selected by `SANDBOX_PROVIDER`
     * (e2b | docker). Memoized — the feature talks only to the manager for
     * lifecycle and to the returned {@link SandboxHandle} for the data plane.
     * See docs/sandbox-runtime.md.
     */
    private getSandboxManager(): SandboxManager {
        if (!this.sandboxManager) {
            const { sandboxProvider } = this.lightdashConfig.appRuntime;
            this.sandboxManager = createSandboxManager({
                provider: sandboxProvider,
                e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
                dockerImage:
                    this.lightdashConfig.appRuntime
                        .sandboxAiWritebackDockerImage,
                lambdaMicroVm: this.lightdashConfig.appRuntime.lambdaMicroVm,
                azureSandboxes:
                    sandboxProvider === 'azure-sandboxes'
                        ? this.getAzureSandboxesConfig()
                        : null,
                // Object-store snapshots are only for the Docker backend (no
                // native pause); native-pause providers (E2B, Lambda, Azure
                // Sandboxes) never touch S3, so don't construct a client.
                snapshotStore:
                    sandboxProvider === 'docker'
                        ? new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          })
                        : null,
                registryModel: this.sandboxRegistryModel,
                logger: this.logger,
            });
        }
        return this.sandboxManager;
    }

    private buildSandboxSpec(templateRef?: string): SandboxSpec {
        return {
            templateRef: templateRef ?? this.getSandboxTemplateRef(),
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
        if (sandboxProvider === 'azure-sandboxes') {
            const diskImage =
                this.lightdashConfig.appRuntime
                    .azureSandboxesAiWritebackDiskImage;
            if (!diskImage) {
                throw new MissingConfigError(
                    'Azure AI writeback sandbox disk image is not configured (AZURE_SANDBOXES_AI_WRITEBACK_DISK_IMAGE)',
                );
            }
            return diskImage;
        }
        return resolveSandboxTemplateRef({
            name: this.lightdashConfig.appRuntime.e2bAiWritebackTemplateName,
            tag: this.lightdashConfig.appRuntime.e2bAiWritebackTemplateTag,
        });
    }

    /** Assemble the `azure-sandboxes` provider config for the AI writeback
     * pipeline (the writeback sandbox group + shared subscription/region settings). */
    private getAzureSandboxesConfig(): AzureSandboxesConfig {
        const {
            azureSandboxes,
            azureSandboxesAiWritebackGroup,
            sandboxIdleTimeoutMs,
        } = this.lightdashConfig.appRuntime;
        if (
            !azureSandboxes.subscriptionId ||
            !azureSandboxes.resourceGroup ||
            !azureSandboxesAiWritebackGroup
        ) {
            throw new MissingConfigError(
                'Azure Sandboxes is not configured (AZURE_SANDBOXES_SUBSCRIPTION_ID / AZURE_SANDBOXES_RESOURCE_GROUP / AZURE_SANDBOXES_AI_WRITEBACK_GROUP)',
            );
        }
        return {
            subscriptionId: azureSandboxes.subscriptionId,
            resourceGroup: azureSandboxes.resourceGroup,
            region: azureSandboxes.region,
            sandboxGroup: azureSandboxesAiWritebackGroup,
            apiVersion: azureSandboxes.apiVersion,
            tokenScope: azureSandboxes.tokenScope,
            resourceTier: azureSandboxes.resourceTier,
            autoSuspendIdleSeconds: Math.floor(sandboxIdleTimeoutMs / 1000),
        };
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
        templateRef: string,
    ): Promise<{
        sandboxUuid: string;
        sandbox: SandboxHandle;
        durationMs: number;
    }> {
        const start = performance.now();
        const spec = this.buildSandboxSpec(templateRef);
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
        templateRef?: string,
    ): Promise<{ sandbox: SandboxHandle; durationMs: number }> {
        const start = performance.now();
        const sandbox = await this.getSandboxManager().resume({
            sandboxUuid,
            spec: this.buildSandboxSpec(templateRef),
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
        return this.runCodingAgent(args, this.dbtWritebackConfig());
    }

    /**
     * Shared coding-agent core: sandbox lifecycle, network lockdown, the agent
     * invocation + stream parsing, the signed-commit → PR pipeline, timeouts,
     * and analytics. The mode-specific half (template, clone options, prompt,
     * tool allowlist, in-sandbox prep/verification) is supplied by `config`.
     * {@link run} wires the dbt-writeback config; the general `editRepo` agent
     * wires its own lean, no-Bash config.
     */
    private async runCodingAgent(
        args: AiWritebackRunArgs,
        config: CodingAgentConfig,
    ): Promise<AiWritebackRunResult> {
        const {
            user,
            projectUuid,
            prompt,
            prUrl,
            startNewPullRequest,
            aiThreadUuid,
            source,
            dbtSourceUuid,
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

        const prepared = await this.prepareTurn({
            user,
            projectUuid,
            prompt,
            aiThreadUuid,
            source,
            dbtSourceUuid,
            featureFlag: config.featureFlag,
            mode: config.mode,
            repoTarget: args.repoTarget,
            prUrl,
            startNewPullRequest,
        });

        // The project has more than one dbt source and the prompt didn't pin a
        // single one down. Ask the caller to choose before spending a sandbox —
        // no clone, no PR. The caller re-runs with the chosen `dbtSourceUuid`.
        if (prepared.kind === 'select') {
            this.logger.info('AI writeback needs a dbt source selection', {
                event: 'ai_writeback.run.needs_selection',
                source,
                projectUuid,
                aiThreadUuid: aiThreadUuid ?? null,
                optionCount: prepared.options.length,
            });
            return AiWritebackService.buildDbtSourceSelectionResult(
                prepared.projectName,
                prepared.options,
            );
        }
        const { turn } = prepared;

        this.logger.info('AI writeback run started', {
            event: 'ai_writeback.run.started',
            source,
            projectUuid,
            aiThreadUuid: aiThreadUuid ?? null,
            isResume: turn.isResume,
            warehouseType: turn.warehouseType,
        });

        const repository = `${turn.gitConnection.owner}/${turn.gitConnection.repo}`;

        // Route the concurrency guard to the WORKSTREAM, not the repo: resuming
        // the same PR (same sandbox) serializes, but editing two different PRs —
        // even on the same repo — runs in parallel. A fresh turn has no row yet,
        // so it locks on `new::repo` to still serialize an accidental double-open
        // of the same repo. One-shots (no thread) are independent. Asserted before
        // tracking so a rejection neither starts analytics nor enters the finally
        // that clears the winner's slot.
        const lockKey = workstreamLockKey(aiThreadUuid, turn, repository);
        this.assertTurnSlotAvailable(aiThreadUuid, lockKey, turn.existingRow);

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
        // Acquire the in-flight slot last, right before the work. The in-memory
        // Set serializes turns on THIS instance; the cross-pod guard below adds a
        // Postgres advisory lock so a racing turn on another instance is rejected
        // too (H1). Acquired immediately before the try so the finally always
        // releases it — no throw-bearing statement sits in between.
        this.acquireTurnSlot(aiThreadUuid, lockKey);
        const workstreamLock = lockKey
            ? await this.aiWritebackThreadModel.acquireWorkstreamLock(lockKey)
            : null;
        if (lockKey && !workstreamLock) {
            this.releaseTurnSlot(aiThreadUuid, lockKey);
            throw new ParameterError(
                turn.existingRow
                    ? 'An edit is already in progress for this pull request (possibly on another server instance). Please wait for it to finish before making another change.'
                    : 'An edit is already in progress for this repository (possibly on another server instance). Please wait for it to finish before making another change.',
            );
        }
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

            // Clone with a scoped, revocable token when the config provides one
            // (general agent) — keep the full installation for the host-side
            // commit. Only mint on a fresh clone; a resume reuses the existing
            // checkout (its clone token was already scrubbed + revoked).
            let cloneInstallation = installation;
            let onAfterClone: (() => Promise<void>) | undefined;
            if (
                config.resolveCloneToken &&
                !turn.existingRow &&
                installation.provider === PullRequestProvider.GITHUB
            ) {
                const minted = await config.resolveCloneToken({
                    gitConnection: turn.gitConnection,
                    installation,
                });
                if (minted) {
                    cloneInstallation = {
                        ...installation,
                        token: minted.token,
                        userToken: null,
                    };
                    onAfterClone = minted.onAfterClone;
                }
            }

            ({ sandbox, sandboxUuid } = await this.acquireSandbox({
                organizationUuid: turn.organizationUuid,
                projectUuid,
                cloneTarget: turn.provider.getCloneTarget(
                    turn.gitConnection,
                    cloneInstallation,
                ),
                existingRow: turn.existingRow,
                adoptBranch: adoptedPr?.headRef ?? null,
                setStage,
                templateRef: config.resolveTemplateRef(),
                cloneExtraOptions: config.cloneExtraOptions,
                onAfterClone,
            }));

            setStage('agent');
            const setup = await config.buildAgentSetup({
                sandbox,
                turn,
                repository,
            });
            const agent = await this.runAgentInSandbox({
                sandbox,
                systemPrompt: setup.systemPrompt,
                prompt,
                isResume: turn.isResume,
                source,
                recordStep,
                allowedTools: setup.allowedTools,
                disallowedTools: setup.disallowedTools,
                addDirs: setup.addDirs,
                model: setup.model,
                warehouseType: turn.warehouseType,
                beforeAgentRun: () => config.beforeAgentRun(sandbox!, turn),
                afterAgentRun: () => config.afterAgentRun(sandbox!),
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
                    dbtSourceUuid: turn.projectDbtSourceUuid,
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
                // The general agent must never commit CI/workflow files (R3);
                // dbt writeback may (preview-deploy setup). Secrets are denied
                // in both regardless.
                denyCiPaths: config.mode === 'general',
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
                dbtSourceUuid: turn.projectDbtSourceUuid,
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
            this.releaseTurnSlot(aiThreadUuid, lockKey);
            if (workstreamLock) {
                // Best-effort: unlocking failures must not mask the run's own
                // error, and the connection is returned to the pool regardless.
                try {
                    await workstreamLock.release();
                } catch (releaseError) {
                    this.logger.warn(
                        `AiWriteback: failed to release workstream advisory lock: ${getErrorMessage(
                            releaseError,
                        )}`,
                    );
                }
            }
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
     * Reject a turn that would race an in-flight workstream, or exceed the
     * per-thread concurrent-turn cap. Pure check — never mutates — so it can run
     * before tracking starts.
     */
    private assertTurnSlotAvailable(
        aiThreadUuid: string | undefined,
        lockKey: string | null,
        existingRow: AiWritebackThreadWithPrUrl | null,
    ): void {
        if (lockKey && this.inFlightWorkstreams.has(lockKey)) {
            throw new ParameterError(
                existingRow
                    ? 'An edit is already in progress for this pull request in this conversation. Please wait for it to finish before making another change.'
                    : 'An edit is already in progress for this repository in this conversation. Please wait for it to finish before making another change.',
            );
        }
        if (
            aiThreadUuid &&
            (this.inFlightTurnsByThread.get(aiThreadUuid) ?? 0) >=
                MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD
        ) {
            throw new ParameterError(
                `Too many edits are already in progress in this conversation (limit ${MAX_CONCURRENT_WORKSTREAM_TURNS_PER_THREAD}). Please wait for one to finish before making another change.`,
            );
        }
    }

    /** Take the workstream lock + a per-thread slot. Pairs with releaseTurnSlot. */
    private acquireTurnSlot(
        aiThreadUuid: string | undefined,
        lockKey: string | null,
    ): void {
        if (lockKey) this.inFlightWorkstreams.add(lockKey);
        if (aiThreadUuid) {
            this.inFlightTurnsByThread.set(
                aiThreadUuid,
                (this.inFlightTurnsByThread.get(aiThreadUuid) ?? 0) + 1,
            );
        }
    }

    /** Release the workstream lock + per-thread slot taken by acquireTurnSlot. */
    private releaseTurnSlot(
        aiThreadUuid: string | undefined,
        lockKey: string | null,
    ): void {
        if (lockKey) this.inFlightWorkstreams.delete(lockKey);
        if (aiThreadUuid) {
            const remaining =
                (this.inFlightTurnsByThread.get(aiThreadUuid) ?? 1) - 1;
            if (remaining <= 0) {
                this.inFlightTurnsByThread.delete(aiThreadUuid);
            } else {
                this.inFlightTurnsByThread.set(aiThreadUuid, remaining);
            }
        }
    }

    /**
     * Pre-flight: enforce source-specific rollout gates, the
     * `manage:SourceCode` permission, decide which dbt source the run targets,
     * and resolve everything from the request that doesn't require a sandbox.
     * Returns `kind: 'select'` instead when the project has several dbt sources
     * and the prompt doesn't pin one down — the caller asks the user to choose.
     */
    private async prepareTurn({
        user,
        projectUuid,
        prompt,
        aiThreadUuid,
        source,
        dbtSourceUuid,
        featureFlag,
        mode,
        repoTarget,
        prUrl,
        startNewPullRequest,
    }: {
        user: SessionUser;
        projectUuid: string;
        prompt: string;
        aiThreadUuid: string | undefined;
        source: AiWritebackSource;
        /**
         * Explicit dbt-source choice (dbt writeback): a UI picker or agent
         * re-call after a `select` outcome. Ignored by the general agent.
         */
        dbtSourceUuid: string | undefined;
        featureFlag: FeatureFlags;
        mode: CodingAgentConfig['mode'];
        /** The general agent's `owner/repo` target; ignored for dbt writeback. */
        repoTarget: string | undefined;
        /**
         * Explicit workstream routing (general agent): when set, resume the
         * workstream whose PR matches this URL rather than the repo's latest.
         */
        prUrl: string | null | undefined;
        /**
         * Force a fresh workstream (new sandbox + new PR) even when the repo
         * already has one in this thread (general agent only).
         */
        startNewPullRequest: boolean | undefined;
    }): Promise<PreparedTurn> {
        await this.assertEnabled(user, source, featureFlag);

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const project = await this.projectModel.get(projectUuid);

        // Resolve the git target and, for dbt writeback, the bound source.
        //  - general agent: an arbitrary writable repo (resolveWritableRepoTarget
        //    enforces manage:SourceCode itself); no dbt source.
        //  - dbt writeback: pick which dbt source to target (#24967) — a resumed
        //    thread stays bound to its source, else explicit/inferred/ask. An
        //    ambiguous choice returns `select` (no sandbox, no PR).
        let provider: GitProvider;
        let gitConnection: GitConnection;
        let projectDbtSourceUuid: string | null;
        let warehouseType: WarehouseTypes | null;
        let dbtVersion: SupportedDbtVersions;
        if (mode === 'general') {
            const resolved = await this.resolveWritableRepoTarget({
                user,
                project,
                repoTarget,
            });
            provider = resolved.provider;
            gitConnection = resolved.gitConnection;
            projectDbtSourceUuid = null;
            warehouseType = resolved.warehouseType;
            dbtVersion = resolved.dbtVersion;
        } else {
            this.assertCanManageSourceCode(user, project, projectUuid);
            // The thread's most-recent workstream row supplies the source
            // binding so a resume never retargets the cloned repo. A dbt thread
            // can now hold several workstreams; they all target the same project
            // dbt source, so the latest row is a correct source anchor.
            const boundStored = aiThreadUuid
                ? await this.aiWritebackThreadModel.findByAiThreadUuid(
                      aiThreadUuid,
                  )
                : null;
            const boundExisting =
                boundStored && boundStored.sandbox_uuid !== null
                    ? { ...boundStored, sandbox_uuid: boundStored.sandbox_uuid }
                    : null;
            const dbtTarget = await this.resolveDbtTarget({
                projectUuid,
                project,
                prompt,
                dbtSourceUuid,
                existingRow: boundExisting,
            });
            if (dbtTarget.kind === 'select') {
                return {
                    kind: 'select',
                    projectName: project.name,
                    options: dbtTarget.options,
                };
            }
            provider = this.getGitProvider(dbtTarget.candidate.connection.type);
            gitConnection = provider.resolveConnection(
                dbtTarget.candidate.connection,
            );
            projectDbtSourceUuid = dbtTarget.candidate.sourceUuid;
            warehouseType = project.warehouseConnection?.type ?? null;
            dbtVersion = resolveSandboxDbtVersion(project.dbtVersion);
        }

        // Route this turn to a workstream (one sandbox + one PR). A thread can
        // hold several per repo — for both the general agent and dbt writeback —
        // so the resume row is selected, never just the repo:
        //  - startNewPullRequest → no resume row: a fresh sandbox + new PR
        //    ("open a separate PR" even when one exists).
        //  - explicit prUrl → the workstream owning that PR; null when the URL is
        //    an external paste, so the adopt path takes over.
        //  - default → the repo's most-recent workstream (the single row for a
        //    thread that has only opened one PR on the repo), i.e. unchanged.
        const targetRepo = `${gitConnection.owner}/${gitConnection.repo}`;
        let storedRow: AiWritebackThreadWithPrUrl | null = null;
        if (aiThreadUuid && !startNewPullRequest) {
            storedRow = prUrl
                ? await this.aiWritebackThreadModel.findByAiThreadUuidAndPrUrl(
                      aiThreadUuid,
                      prUrl,
                  )
                : await this.aiWritebackThreadModel.findActiveWorkstreamByRepo(
                      aiThreadUuid,
                      targetRepo,
                  );
        }
        // A null `sandbox_uuid` means an old pod inserted this row mid-rollout
        // (it set the legacy `sandbox_id` column the new code no longer reads),
        // so there's no resumable registry sandbox. Clear the stale row — by its
        // own uuid, since a thread may hold other repos' rows — and start fresh
        // rather than carry an unresumable pointer.
        if (storedRow && storedRow.sandbox_uuid === null) {
            await this.aiWritebackThreadModel.deleteByUuid(
                storedRow.ai_writeback_thread_uuid,
            );
        }
        let existingRow: ResumableWritebackThread | null =
            storedRow && storedRow.sandbox_uuid !== null
                ? { ...storedRow, sandbox_uuid: storedRow.sandbox_uuid }
                : null;

        // A workstream whose PR was deleted has its `pull_request_uuid` cleared
        // (FK ON DELETE SET NULL), so the join yields a null `pr_url`. Resuming it
        // would push onto an orphaned branch and then throw in applyAgentChanges,
        // discarding the agent's work. Instead treat the turn as FRESH: open a new
        // PR off the default branch. The new workstream row supersedes the stale
        // one (findActiveWorkstreamByRepo orders by created_at desc). (M4)
        if (existingRow && !existingRow.pr_url) {
            this.logger.info(
                `AiWriteback: workstream ${existingRow.ai_writeback_thread_uuid} has no live PR (deleted) — starting a fresh pull request instead of resuming.`,
            );
            existingRow = null;
        }

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

        return {
            kind: 'run',
            turn: {
                organizationUuid: user.organizationUuid,
                projectName: project.name,
                provider,
                gitConnection,
                projectDbtSourceUuid,
                existingRow,
                isResume: existingRow !== null,
                warehouseType,
                dbtVersion,
            },
        };
    }

    /**
     * The shared `manage:SourceCode` gate for any coding-agent write. Mirrors
     * GitIntegrationService's PR-creating paths: writes open a PR from a fresh
     * feature branch, so `isProtectedBranch: false`.
     */
    private assertCanManageSourceCode(
        user: SessionUser,
        project: Awaited<ReturnType<ProjectModel['get']>>,
        projectUuid: string,
    ): void {
        const canManage = this.createAuditedAbility(user).can(
            'manage',
            subject('SourceCode', {
                organizationUuid: project.organizationUuid,
                projectUuid,
                isProtectedBranch: false,
            }),
        );
        if (!canManage) {
            throw new ForbiddenError();
        }
    }

    /**
     * Build the candidate dbt sources a writeback run can target: the project's
     * primary dbt connection (precedence 0) plus any additional
     * `project_dbt_sources`, keeping only the git-backed ones — GitHub/GitLab
     * are the only sources writeback can open a PR against. A non-git primary
     * (e.g. a local `dbt` or dbt-cloud project) is therefore dropped, but its
     * git-backed additional sources are still targetable. A project with no
     * additional sources yields just the primary — the single-source path.
     */
    private async listDbtTargetCandidates(
        projectUuid: string,
        project: { projectUuid: string; dbtConnection: DbtProjectConfig },
    ): Promise<DbtTargetCandidate[]> {
        const primary: DbtTargetCandidate | null =
            AiWritebackService.isWritebackTargetable(project.dbtConnection.type)
                ? {
                      sourceUuid: null,
                      // The primary's client-facing id is the project uuid — the
                      // same id the project's dbt-sources list synthesises for it.
                      optionUuid: project.projectUuid,
                      name: 'Project dbt connection',
                      isPrimary: true,
                      connection: project.dbtConnection,
                  }
                : null;
        const additional =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        const extra = additional.flatMap<DbtTargetCandidate>((dbtSource) =>
            dbtSource.dbtConnection &&
            AiWritebackService.isWritebackTargetable(
                dbtSource.dbtConnection.type,
            )
                ? [
                      {
                          sourceUuid: dbtSource.projectDbtSourceUuid,
                          optionUuid: dbtSource.projectDbtSourceUuid,
                          name: dbtSource.name,
                          isPrimary: false,
                          connection: dbtSource.dbtConnection,
                      },
                  ]
                : [],
        );
        return primary ? [primary, ...extra] : extra;
    }

    /**
     * Decide which dbt source a turn targets. Precedence:
     * 1. a resumed thread stays bound to its original source (never re-infer, or
     *    a follow-up could retarget the sandbox's already-cloned repo);
     * 2. an explicit `dbtSourceUuid` (a UI picker, or an agent re-call);
     * 3. the only source, when the project has one — unchanged behaviour;
     * 4. the source the prompt names, when exactly one matches;
     * otherwise return the candidates for the caller to choose from.
     */
    private async resolveDbtTarget({
        projectUuid,
        project,
        prompt,
        dbtSourceUuid,
        existingRow,
    }: {
        projectUuid: string;
        project: { projectUuid: string; dbtConnection: DbtProjectConfig };
        prompt: string;
        dbtSourceUuid: string | undefined;
        existingRow: ResumableWritebackThread | null;
    }): Promise<
        | { kind: 'resolved'; candidate: DbtTargetCandidate }
        | { kind: 'select'; options: AiWritebackDbtSourceOption[] }
    > {
        const candidates = await this.listDbtTargetCandidates(
            projectUuid,
            project,
        );

        // No git-backed source anywhere (non-git primary, no git additional
        // sources) — there's nothing to open a PR against. Mirror the connection
        // gate getGitProvider enforced when the primary was the only target.
        if (candidates.length === 0) {
            throw new WritebackGitNotConnectedError(
                null,
                `AI writeback requires a GitHub or GitLab dbt source, but this project ("${project.dbtConnection.type}") has none`,
            );
        }

        if (existingRow) {
            const bound = candidates.find(
                (c) => c.sourceUuid === existingRow.project_dbt_source_uuid,
            );
            if (bound) {
                return { kind: 'resolved', candidate: bound };
            }
            // The bound source is null (the primary) or was deleted after the
            // thread started (FK SET NULL). Prefer the primary — but it is only a
            // candidate when git-backed, so `candidates[0]` is NOT always the
            // primary. Look it up explicitly, and when the primary is non-git
            // (absent) fall back to the first git-backed source.
            const primary = candidates.find((c) => c.isPrimary);
            return { kind: 'resolved', candidate: primary ?? candidates[0] };
        }

        if (dbtSourceUuid) {
            const chosen = candidates.find(
                (c) => c.optionUuid === dbtSourceUuid,
            );
            if (!chosen) {
                throw new ParameterError(
                    'The specified dbt source is not a valid writeback target for this project',
                );
            }
            return { kind: 'resolved', candidate: chosen };
        }

        if (candidates.length === 1) {
            return { kind: 'resolved', candidate: candidates[0] };
        }

        // Score each candidate by how specifically the prompt names it (the
        // length of the longest identifier of it found in the prompt), then take
        // the single best. Scoring by length — not just "matched at all" — is
        // what disambiguates prefix-related names: a prompt saying "jaffle-2"
        // matches both `jaffle` and `jaffle-2` as substrings, but `jaffle-2` is
        // the more specific (longer) match and wins. A tie for the top score
        // (e.g. the prompt names two sources) stays ambiguous and asks.
        const scored = candidates
            .map((candidate) => ({
                candidate,
                score: AiWritebackService.dbtSourceMatchScore(
                    prompt,
                    candidate,
                ),
            }))
            .filter((s) => s.score > 0);
        if (scored.length > 0) {
            const topScore = Math.max(...scored.map((s) => s.score));
            const top = scored.filter((s) => s.score === topScore);
            if (top.length === 1) {
                return { kind: 'resolved', candidate: top[0].candidate };
            }
        }

        return {
            kind: 'select',
            options: candidates.map(AiWritebackService.toDbtSourceOption),
        };
    }

    private static isWritebackTargetable(type: DbtProjectType): boolean {
        // Mirrors getGitProvider: only GitHub and GitLab can have a PR opened.
        return type === DbtProjectType.GITHUB || type === DbtProjectType.GITLAB;
    }

    /** Git identity safe to surface (repo/branch/subpath); nulls for non-git. */
    private static dbtSourceGitIdentity(connection: DbtProjectConfig): {
        repository: string | null;
        branch: string | null;
        projectSubPath: string | null;
    } {
        if (
            connection.type === DbtProjectType.GITHUB ||
            connection.type === DbtProjectType.GITLAB ||
            connection.type === DbtProjectType.BITBUCKET ||
            connection.type === DbtProjectType.AZURE_DEVOPS
        ) {
            return {
                repository: connection.repository,
                branch: connection.branch,
                projectSubPath: connection.project_sub_path,
            };
        }
        return { repository: null, branch: null, projectSubPath: null };
    }

    private static toDbtSourceOption(
        candidate: DbtTargetCandidate,
    ): AiWritebackDbtSourceOption {
        return {
            projectDbtSourceUuid: candidate.optionUuid,
            name: candidate.name,
            isPrimary: candidate.isPrimary,
            ...AiWritebackService.dbtSourceGitIdentity(candidate.connection),
        };
    }

    /**
     * How specifically the prompt names this dbt source: the length of the
     * longest identifier of it (full `owner/repo`, the repo name, or a
     * non-generic source name) that appears in the prompt, or 0 if none do.
     * Returning a length — rather than a boolean — lets the caller prefer the
     * most specific match, so prefix-related names (`jaffle` vs `jaffle-2`)
     * disambiguate to the longer one instead of colliding.
     */
    private static dbtSourceMatchScore(
        prompt: string,
        candidate: DbtTargetCandidate,
    ): number {
        const haystack = prompt.toLowerCase();
        const { repository } = AiWritebackService.dbtSourceGitIdentity(
            candidate.connection,
        );
        const needles: string[] = [];
        if (repository) {
            needles.push(repository.toLowerCase());
            const repoName = repository.split('/').pop();
            if (repoName) {
                needles.push(repoName.toLowerCase());
            }
        }
        // Skip the synthesised primary's generic name — it names nothing useful.
        if (!candidate.isPrimary && candidate.name.trim().length >= 3) {
            needles.push(candidate.name.toLowerCase());
        }
        return needles
            .filter((needle) => needle.length >= 3 && haystack.includes(needle))
            .reduce((best, needle) => Math.max(best, needle.length), 0);
    }

    /**
     * The "which dbt source?" response: a normal run result that opened no PR,
     * carrying the options to choose from plus a human-readable `output` so every
     * surface (API, MCP, Slack, web) can present the choice with no bespoke code.
     */
    private static buildDbtSourceSelectionResult(
        projectName: string,
        options: AiWritebackDbtSourceOption[],
    ): AiWritebackRunResult {
        const lines = options.map((option) => {
            const repo = option.repository ? ` (${option.repository})` : '';
            const tag = option.isPrimary ? ' [primary]' : '';
            return `- ${option.name}${repo}${tag}`;
        });
        const output = [
            "This project has more than one dbt source, so I couldn't tell which one to change. Pick one and run the writeback again with that dbt source selected:",
            ...lines,
        ].join('\n');
        return {
            output,
            exitCode: 0,
            prUrl: null,
            prAction: null,
            commitSha: null,
            additions: null,
            deletions: null,
            projectName,
            repository: '',
            steps: [],
            dbtSourceUuid: null,
            needsDbtSourceSelection: true,
            dbtSourceOptions: options,
        };
    }

    /**
     * The general coding agent's authz chokepoint and the ONLY place an
     * arbitrary-repo {@link CloneTarget} is produced. Enforces, in order:
     *   1. `manage:SourceCode` on the project (`isProtectedBranch: false`);
     *   2. a hard denylist (`lightdash/lightdash`);
     *   3. target ∈ (installation-accessible ∩ user-accessible) via the shared
     *      {@link computeWritableRepoKeys} predicate (R5).
     * Returns the GitHub target at repo root (`projectSubPath: '.'`). GitLab
     * targets are a later slice; the per-repo scoped clone token is Slice 3.
     */
    async resolveWritableRepoTarget({
        user,
        project,
        repoTarget,
    }: {
        user: SessionUser;
        project: Awaited<ReturnType<ProjectModel['get']>>;
        repoTarget: string | undefined;
    }): Promise<ResolvedTurnTarget> {
        this.assertCanManageSourceCode(user, project, project.projectUuid);
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const { owner, repo } = parseOwnerRepo(repoTarget);
        const key = `${owner}/${repo}`;
        if (DENYLISTED_WRITE_REPOS.has(key.toLowerCase())) {
            throw new ForbiddenError(`The repository ${key} cannot be edited`);
        }

        // The host follows the project's connection (like the repo picker): a
        // GitLab-connected project edits its GitLab repos, otherwise GitHub.
        if (project.dbtConnection.type === DbtProjectType.GITLAB) {
            return this.resolveWritableGitlabTarget({
                user,
                project,
                owner,
                repo,
                key,
            });
        }
        return this.resolveWritableGithubTarget({
            user,
            project,
            owner,
            repo,
            key,
        });
    }

    /** GitHub branch of {@link resolveWritableRepoTarget}: user ∩ installation. */
    private async resolveWritableGithubTarget({
        user,
        project,
        owner,
        repo,
        key,
    }: {
        user: SessionUser;
        project: Awaited<ReturnType<ProjectModel['get']>>;
        owner: string;
        repo: string;
        key: string;
    }): Promise<ResolvedTurnTarget> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const installation = await this.githubProvider.resolveInstallation(
            user.organizationUuid,
        );
        if (installation.provider !== PullRequestProvider.GITHUB) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITHUB,
                'GitHub App is not installed for this organization',
            );
        }
        const { installationId } = installation;

        const [installationRepos, userToken] = await Promise.all([
            listReposAccessibleToInstallation({ installationId }),
            this.githubAppService.getValidUserToken(
                user.userUuid,
                user.organizationUuid,
            ),
        ]);

        // Intersect with the user's own GitHub access (R1) when they've linked.
        // The intersection is a hard requirement once a user token exists: if we
        // can't list the user's repos we must FAIL CLOSED for this target rather
        // than degrade to the installation scope — degrading would authorize a
        // write against any installation-accessible repo the user's own GitHub
        // account may not reach, on nothing more than a transient API/rate-limit
        // error. Deny the target instead (logged).
        const intersectWithUser = Boolean(userToken);
        let userRepos: { owner: string; repo: string }[] = [];
        if (userToken) {
            try {
                userRepos = await listReposAccessibleToUser({
                    token: userToken,
                });
            } catch (error) {
                this.logger.warn(
                    `AiCodingAgent: user repo listing failed — failing closed on write authz for ${key} rather than degrading to installation scope: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw new ForbiddenError(
                    `Could not verify your GitHub access to ${key}, so no pull request was opened. This is usually transient — try again.`,
                );
            }
        }

        const writable = computeWritableRepoKeys(
            installationRepos,
            userRepos,
            intersectWithUser,
        );
        // Case-insensitive membership: `key` is user-supplied (repoTarget) and
        // may differ in case from the canonical installation listing (L1).
        const writableLower = new Set(
            [...writable].map((k) => k.toLowerCase()),
        );
        if (!writableLower.has(key.toLowerCase())) {
            const inInstallation = installationRepos.some(
                (r) =>
                    `${r.owner}/${r.repo}`.toLowerCase() === key.toLowerCase(),
            );
            const reason = inInstallation
                ? `${key} is not accessible to your linked GitHub account`
                : `${key} is not accessible to your organization's GitHub App installation`;
            throw new ForbiddenError(reason);
        }

        // Pre-clone size guard (R9): fail closed BEFORE any sandbox/clone with an
        // actionable error, never a deadline_exceeded from a giant clone.
        const { defaultBranch: branch, sizeKb } = await getRepoMetadata({
            owner,
            repo,
            installationId,
        });
        const limitMb =
            this.lightdashConfig.aiWriteback.codingAgentMaxRepoSizeMb;
        const sizeMb = Math.round(sizeKb / 1024);
        if (sizeMb > limitMb) {
            throw new RepoTooLargeError(key, sizeMb, limitMb);
        }

        return {
            organizationUuid: user.organizationUuid,
            projectName: project.name,
            provider: this.githubProvider,
            gitConnection: {
                provider: PullRequestProvider.GITHUB,
                owner,
                repo,
                // General edits target the whole repo, not a dbt sub-folder.
                projectSubPath: '.',
                branch,
            },
            // No warehouse/dbt context for a general edit; a default dbt version
            // keeps the type satisfied (the general path never compiles).
            warehouseType: null,
            dbtVersion: resolveSandboxDbtVersion(project.dbtVersion),
        };
    }

    /**
     * GitLab branch of {@link resolveWritableRepoTarget}. Unlike GitHub, a GitLab
     * install acts as a single identity with no per-user account linking, so
     * every project the install can reach is writable (minus the denylist).
     */
    private async resolveWritableGitlabTarget({
        user,
        project,
        owner,
        repo,
        key,
    }: {
        user: SessionUser;
        project: Awaited<ReturnType<ProjectModel['get']>>;
        owner: string;
        repo: string;
        key: string;
    }): Promise<ResolvedTurnTarget> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const access = await this.getGitlabInstallationRepoReadAccess({
            user,
            projectUuid: project.projectUuid,
        });
        const repos = await access.listRepos();
        const writable = computeWritableRepoKeys(
            repos.map((r) => ({ owner: r.owner, repo: r.repo })),
            [],
            // GitLab: single install identity, no user-intersection.
            false,
        );
        // Case-insensitive membership: `key` is user-supplied (L1).
        const writableLower = new Set(
            [...writable].map((k) => k.toLowerCase()),
        );
        if (!writableLower.has(key.toLowerCase())) {
            throw new ForbiddenError(
                `${key} is not accessible to your organization's GitLab installation`,
            );
        }

        // Pre-clone size guard (R9), mirroring the GitHub path: fail closed with
        // an actionable error before cloning a giant repo. GitLab exposes size via
        // project statistics; when unavailable (null) we can't enforce it and fall
        // back to the clone timeout rather than blocking a valid edit.
        const sizeMb = await getGitlabRepositorySizeMb({
            owner,
            repo,
            token: access.token,
            hostDomain: access.hostDomain,
        });
        const limitMb =
            this.lightdashConfig.aiWriteback.codingAgentMaxRepoSizeMb;
        if (sizeMb !== null && sizeMb > limitMb) {
            throw new RepoTooLargeError(key, sizeMb, limitMb);
        }

        return {
            organizationUuid: user.organizationUuid,
            projectName: project.name,
            provider: this.gitlabProvider,
            gitConnection: {
                provider: PullRequestProvider.GITLAB,
                owner,
                repo,
                projectSubPath: '.',
                hostDomain: access.hostDomain,
            },
            warehouseType: null,
            dbtVersion: resolveSandboxDbtVersion(project.dbtVersion),
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
        templateRef,
        cloneExtraOptions,
        onAfterClone,
    }: {
        organizationUuid: string;
        projectUuid: string;
        cloneTarget: CloneTarget;
        existingRow: ResumableWritebackThread | null;
        adoptBranch: string | null;
        setStage: SetStage;
        templateRef: string;
        cloneExtraOptions: Record<string, unknown>;
        /** Run after a fresh clone + .git scrub (e.g. revoke the scoped token). */
        onAfterClone?: () => Promise<void>;
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
                // other permanent failure). GC the dead registry sandbox and
                // clear THIS (thread, repo) row only — other repos' rows on the
                // same thread keep their sandboxes — so the next turn for this
                // repo starts fresh instead of looping on the dead reference.
                this.logger.warn(
                    `AiWriteback: failed to resume sandbox ${existingRow.sandbox_uuid} — clearing conversation row (ai_thread_uuid=${existingRow.ai_thread_uuid}, repo=${existingRow.target_repo}): ${getErrorMessage(error)}`,
                );
                if (!(error instanceof SandboxExpiredError)) {
                    await this.getSandboxManager().destroy({
                        sandboxUuid: existingRow.sandbox_uuid,
                    });
                }
                await this.aiWritebackThreadModel.deleteByUuid(
                    existingRow.ai_writeback_thread_uuid,
                );
                throw new ParameterError(
                    'This writeback conversation has expired. Please start a new one.',
                );
            }
        }

        const { sandbox, sandboxUuid } = await this.createSandbox(
            organizationUuid,
            projectUuid,
            templateRef,
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
            ...cloneExtraOptions,
            ...(adoptBranch ? { branch: adoptBranch } : {}),
        });
        this.logger.info(
            `AiWriteback: repo cloned (sandboxId=${sandbox.sandboxId}, ${
                Date.now() - cloneStartedAt
            }ms)`,
        );

        // Scrub any clone credential the SDK may have persisted in `.git`
        // (remote URL or credential helper) so the agent — which has Read access
        // over the working tree — can't lift the token out of `.git/config` and
        // exfiltrate it via the PR (R4). The host commits via the API / explicit
        // push creds, so a credential-free remote URL is all the sandbox needs.
        try {
            await sandbox.commands.run(
                `git -C ${CWD} remote set-url origin ${cloneTarget.url} && ` +
                    `git -C ${CWD} config --remove-section credential 2>/dev/null; true`,
            );
        } catch (error) {
            this.logger.warn(
                `AiWriteback: failed to scrub clone credentials from .git (sandboxId=${sandbox.sandboxId}): ${getErrorMessage(
                    error,
                )}`,
            );
        }

        // Revoke the scoped clone token now the checkout exists (general agent).
        // Best-effort: a revoke failure is logged, not thrown — the token is
        // already scrubbed from .git and GitHub caps it at 1h anyway.
        if (onAfterClone) {
            try {
                await onAfterClone();
            } catch (error) {
                this.logger.warn(
                    `AiWriteback: onAfterClone (clone-token revoke) failed (sandboxId=${sandbox.sandboxId}): ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        }
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
        allowedTools,
        disallowedTools,
        addDirs,
        model,
        warehouseType,
        beforeAgentRun,
        afterAgentRun,
    }: {
        sandbox: SandboxHandle;
        systemPrompt: string;
        prompt: string;
        isResume: boolean;
        source: AiWritebackSource;
        recordStep: (step: AiWritebackStep) => void;
        /** Claude Code `--allowedTools` string for this mode. */
        allowedTools: string;
        /** Claude Code `--disallowedTools` string (paths denied under the allow). */
        disallowedTools: string | undefined;
        /** Extra `--add-dir` mounts beyond the repo CWD. */
        addDirs: string[];
        /** Anthropic model the CLI runs with. */
        model: string;
        /** For run-summary logging only; null when no warehouse is connected. */
        warehouseType: WarehouseTypes | null;
        /** Mode-specific setup run just before the CLI (e.g. dbt compile wrapper). */
        beforeAgentRun: () => Promise<void>;
        /** Mode-specific teardown run just after the CLI (e.g. dbt compile timings). */
        afterAgentRun: () => Promise<void>;
    }): Promise<{
        stdout: string;
        exitCode: number;
        usage: AiWritebackUsage | null;
    }> {
        await sandbox.files.write(SYSTEM_PROMPT_PATH, systemPrompt);
        await sandbox.files.write(PROMPT_PATH, prompt);

        // Mode-specific in-sandbox preparation (dbt: install the secret-stripping
        // compile wrapper, push warehouse skills, reset the compile-timings log;
        // general: nothing — no toolchain, no Bash).
        await beforeAgentRun();

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
        const disallowedFlag = disallowedTools
            ? ` --disallowedTools "${disallowedTools}"`
            : '';
        let result;
        try {
            result = await sandbox.commands.run(
                `cat ${PROMPT_PATH} | claude -p ${continueFlag}` +
                    `--model ${model} ` +
                    `--append-system-prompt-file ${SYSTEM_PROMPT_PATH} ` +
                    // stream-json emits one event per line on stdout (assistant
                    // messages, tool_use blocks, tool_results, final cost summary).
                    // --verbose is required by the CLI when combining -p with
                    // stream-json output.
                    '--output-format stream-json --verbose ' +
                    // Claude Code confines Write/Edit to the cwd workspace, so any
                    // path the agent must write/read outside CWD (e.g. /tmp for PR
                    // metadata, the skills dirs) has to be added explicitly or the
                    // operation is refused. The mounts differ per mode.
                    `${addDirs.map((dir) => `--add-dir ${dir}`).join(' ')} ` +
                    `--allowedTools "${allowedTools}"${disallowedFlag}`,
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

        // Mode-specific teardown (dbt: read + report the `lightdash compile`
        // timings the wrapper accumulated; general: nothing).
        await afterAgentRun();

        return {
            stdout: assistantText,
            exitCode: result.exitCode,
            usage: agentUsage,
        };
    }

    /**
     * Report how much of the agent stage went to `lightdash compile` (each
     * invocation timed by the dbt compile wrapper) — the prime suspect for
     * writeback latency. Best-effort: never fail the run over a missing timings
     * file. dbt-writeback only; the general agent has no compile step.
     */
    private async reportCompileTimings(sandbox: SandboxHandle): Promise<void> {
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
    }

    /**
     * Install the dbt compile wrapper, push the warehouse skill files, and reset
     * the compile-timings log — the in-sandbox prerequisites for a dbt-writeback
     * turn. Extracted as the `beforeAgentRun` hook of {@link dbtWritebackConfig}.
     */
    private async prepareDbtAgentRun(
        sandbox: SandboxHandle,
        turn: TurnContext,
    ): Promise<void> {
        // Install the compile wrapper. The agent runs ${COMPILE_WRAPPER_PATH}
        // (allowlisted) instead of `lightdash compile` directly, and the wrapper
        // drops secrets from the environment before exec'ing the real CLI — so a
        // malicious dbt model in the checkout cannot read them via Jinja
        // `env_var(...)` during the compile. The `unset` list is fixed (no
        // interpolation of untrusted input).
        const unsetFlags = COMPILE_STRIPPED_ENV_VARS.map(
            (name) => `-u ${name}`,
        ).join(' ');
        // Prepend the project's dbt-version venv bin to PATH so the bare `dbt`
        // the Lightdash CLI invokes resolves to the version the project is
        // configured to use (the image installs every supported version in its
        // own venv). `lightdash` still resolves via the inherited PATH. This is
        // the only place `dbt` runs — the agent is allowlisted to this wrapper.
        const dbtBin = dbtSandboxVenvBin(turn.dbtVersion);
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

        // Install dbt package dependencies (`dbt deps`) once per turn, before the
        // agent's first compile. A fresh clone has no `dbt_packages/`, so any
        // project with a non-empty `packages.yml` — a `local:` monorepo package or
        // an ordinary dbt-hub package — fails `lightdash compile`/`dbt ls` with
        // "Run dbt deps to install package dependencies". Run it here (not in the
        // compile wrapper, which is re-invoked on every compile within a turn — a
        // per-compile `deps` would be wasteful). Reuse the wrapper's `dbtBin` PATH
        // and secret-stripped env so a malicious dbt_project.yml can't read secrets
        // via Jinja `env_var(...)` during parse. Best-effort: `commands.run` throws
        // on a non-zero exit, so tolerate a deps failure (e.g. transient hub
        // fetch) — the agent's compile surfaces the same error if it truly can't
        // resolve, and we're no worse off than before this ran.
        try {
            await sandbox.commands.run(
                `env ${unsetFlags} PATH="${dbtBin}:$PATH" dbt deps --project-dir ${JSON.stringify(
                    `${CWD}/${turn.gitConnection.projectSubPath}`,
                )}`,
            );
            // `dbt deps` rewrites `<projectSubPath>/package-lock.yml` — and the
            // sandbox dbt version usually differs from the one that generated the
            // committed lockfile, so it reformats it / bumps its sha1_hash even
            // when nothing actually changed. That's pure noise in a
            // metadata-writeback PR, so restore the committed lockfile — or drop
            // it entirely when deps created one the repo didn't track. Either way
            // `dbt_packages/` stays installed, so compile is unaffected.
            const lockfile = `${turn.gitConnection.projectSubPath}/package-lock.yml`;
            await sandbox.commands.run(
                `git -C ${CWD} checkout -- ${JSON.stringify(
                    lockfile,
                )} 2>/dev/null || rm -f ${JSON.stringify(`${CWD}/${lockfile}`)}`,
            );
        } catch (error) {
            this.logger.warn(
                `AiWriteback: 'dbt deps' failed (continuing; compile will surface any unresolved packages): ${getErrorMessage(
                    error,
                )} (sandboxId=${sandbox.sandboxId})`,
            );
        }

        // Push the warehouse skill files alongside the prompts. `shared.md`
        // always; the dialect file only when one exists for this warehouse.
        // The system prompt points the agent here before any `type:`/SQL edit.
        const skills = await loadWarehouseSkills(
            warehouseTypeToSkillKey(turn.warehouseType),
        );
        await sandbox.files.write(SHARED_SKILL_PATH, skills.shared);
        if (skills.warehouse !== null) {
            await sandbox.files.write(WAREHOUSE_SKILL_PATH, skills.warehouse);
        }
    }

    /**
     * Build the dbt-writeback {@link CodingAgentConfig}: the dbt E2B template,
     * the full {@link ALLOWED_TOOLS} (incl. the compile wrapper), the dbt repo
     * context + profiles + warehouse-aware system prompt, and the compile
     * wrapper / timings hooks. This is the specialization {@link run} uses.
     */
    private dbtWritebackConfig(): CodingAgentConfig {
        return {
            mode: 'dbt-writeback',
            featureFlag: FeatureFlags.AiWriteback,
            // Provider-aware writeback template (E2B template ref on e2b, the
            // Docker image on docker) — the same resolution the rest of the
            // sandbox lifecycle uses.
            resolveTemplateRef: () => this.getSandboxTemplateRef(),
            cloneExtraOptions: {},
            buildAgentSetup: async ({ sandbox, turn, repository }) => {
                const repoContext = await this.gatherRepoContext(
                    sandbox,
                    turn.gitConnection.projectSubPath,
                );
                // Stage a credential-free profiles copy host-side so the agent
                // doesn't burn turns discovering profiles.yml and hand-stripping
                // Jinja (mkdir + cp + edit). Deterministic string work — no
                // reason to spend LLM round-trips on it.
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
                return {
                    systemPrompt,
                    allowedTools: ALLOWED_TOOLS,
                    addDirs: ['/tmp', SKILLS_DIR, CLAUDE_SKILLS_DIR],
                    model: CLAUDE_MODEL,
                };
            },
            beforeAgentRun: (sandbox, turn) =>
                this.prepareDbtAgentRun(sandbox, turn),
            afterAgentRun: (sandbox) => this.reportCompileTimings(sandbox),
        };
    }

    /**
     * Run one turn of the general-purpose coding agent (`editRepo`): edit a repo
     * and open/update a pull request, with no dbt/compile step — verification
     * lives in the PR's own CI. Targets ANY repo the request resolves through the
     * authz chokepoint ({@link resolveWritableRepoTarget}: manage:SourceCode +
     * denylist + user∩installation), NOT just the project's dbt-connection repo.
     * Gated by the CodingAgent flag (asserted in `prepareTurn`). Every attempt is
     * written to the coding-agent write audit (allowed and denied alike).
     */
    async runEditRepo(args: AiWritebackRunArgs): Promise<AiWritebackRunResult> {
        this.logger.info('AI coding agent run requested', {
            event: 'ai_coding_agent.run.requested',
            projectUuid: args.projectUuid,
            repoTarget: args.repoTarget ?? null,
            source: args.source,
        });
        try {
            const result = await this.runCodingAgent(
                args,
                this.generalCodingAgentConfig(),
            );
            this.emitWriteAudit({
                user: args.user,
                projectUuid: args.projectUuid,
                targetRepo: result.repository,
                allowed: true,
                reason: null,
            });
            return result;
        } catch (error) {
            // Audit every denied/failed attempt with the condition-specific
            // reason — the forensic record of the org token mutating a repo.
            this.emitWriteAudit({
                user: args.user,
                projectUuid: args.projectUuid,
                targetRepo: args.repoTarget ?? null,
                allowed: false,
                reason: auditReasonForError(error),
            });
            throw error;
        }
    }

    /**
     * Read-only: the pull requests (workstreams) a chat thread has opened with
     * the coding agent, newest first, optionally scoped to one repo. Backs the
     * `listWorkstreams` tool so the agent can route a follow-up to an existing PR
     * or decide to open a new one. Returns [] for a thread that has none.
     */
    async listWorkstreams(args: {
        aiThreadUuid: string | undefined;
        repoTarget: string | null;
    }): Promise<
        {
            repository: string;
            provider: string;
            prUrl: string;
            prNumber: number;
            summary: string | null;
        }[]
    > {
        if (!args.aiThreadUuid) return [];
        const rows = await this.aiWritebackThreadModel.listByAiThreadUuid(
            args.aiThreadUuid,
            args.repoTarget,
        );
        return rows.map((row) => ({
            repository: `${row.owner}/${row.repo}`,
            provider: row.provider,
            prUrl: row.pr_url,
            prNumber: row.pr_number,
            summary: row.summary,
        }));
    }

    /**
     * The coding-agent write audit (decision #2): one structured line per
     * attempt — `{ user, project, target_repo, allowed, reason }` — so the org
     * installation token mutating an arbitrary repo always leaves a trail. Self
     * contained: an audit failure must never affect the run.
     */
    private emitWriteAudit({
        user,
        projectUuid,
        targetRepo,
        allowed,
        reason,
    }: {
        user: SessionUser;
        projectUuid: string;
        targetRepo: string | null;
        allowed: boolean;
        reason: string | null;
    }): void {
        try {
            this.logger.info('coding_agent_write', {
                event: 'coding_agent_write',
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid ?? null,
                projectUuid,
                targetRepo,
                allowed,
                reason,
            });
        } catch {
            // best-effort audit; never throw back into the run
        }
    }

    /**
     * Build the general coding-agent {@link CodingAgentConfig}: the lean E2B
     * template, the no-Bash {@link GENERAL_ALLOWED_TOOLS}, a repo-generic system
     * prompt with a light host-computed file listing, and no compile hooks. The
     * security-critical difference from {@link dbtWritebackConfig} is the absence
     * of Bash + any toolchain, so "no in-sandbox build" is enforceable.
     */
    private generalCodingAgentConfig(): CodingAgentConfig {
        const { e2bCodingAgentTemplateName, e2bCodingAgentTemplateTag } =
            this.lightdashConfig.appRuntime;
        return {
            mode: 'general',
            featureFlag: FeatureFlags.CodingAgent,
            resolveTemplateRef: () =>
                resolveSandboxTemplateRef({
                    name: e2bCodingAgentTemplateName,
                    tag: e2bCodingAgentTemplateTag,
                }),
            // depth:1 (acquireSandbox) + blob:none keeps the clone minimal; the
            // pre-clone size guard (resolveWritableRepoTarget) bounds it further.
            cloneExtraOptions: { filter: 'blob:none' },
            resolveCloneToken: async ({ gitConnection, installation }) => {
                // GitHub: mint a per-repo contents:read-only token, revoked once
                // the checkout exists. GitLab can't revoke OAuth tokens as
                // cleanly, so it falls back to the .git scrub only (null here).
                if (installation.provider !== PullRequestProvider.GITHUB) {
                    return null;
                }
                const token = await getScopedRepoCloneToken({
                    installationId: installation.installationId,
                    repo: gitConnection.repo,
                });
                return {
                    token,
                    onAfterClone: async () => {
                        await revokeInstallationToken(token);
                        this.logger.info(
                            'AI coding agent scoped clone token revoked',
                            { event: 'ai_coding_agent.clone_token.revoked' },
                        );
                    },
                };
            },
            buildAgentSetup: async ({ sandbox, repository }) => {
                const repoContext =
                    await this.gatherGeneralRepoContext(sandbox);
                return {
                    systemPrompt: buildGeneralSystemPrompt({
                        repository,
                        repoContext,
                    }),
                    allowedTools: GENERAL_ALLOWED_TOOLS,
                    disallowedTools: GENERAL_DISALLOWED_TOOLS,
                    addDirs: ['/tmp', GENERAL_SKILLS_DIR],
                    model: CLAUDE_MODEL,
                };
            },
            // No in-sandbox prep/teardown: no compile wrapper, no skills push.
            beforeAgentRun: () => Promise.resolve(),
            afterAgentRun: () => Promise.resolve(),
        };
    }

    /**
     * Host-side, best-effort listing of the cloned repo's tracked files to seed
     * the general agent's prompt (so it doesn't burn turns rediscovering the
     * tree). Runs `git ls-files` on the host — not the agent — so it needs no
     * Bash allowlist. Capped and null-on-failure: the agent can always fall back
     * to Glob/Grep.
     */
    private async gatherGeneralRepoContext(
        sandbox: SandboxHandle,
    ): Promise<string | null> {
        const MAX_FILES = 600;
        try {
            const result = await sandbox.commands.run(
                `git -C ${CWD} ls-files | head -n ${MAX_FILES}`,
                { cwd: CWD, timeoutMs: REPO_CONTEXT_TIMEOUT_MS },
            );
            const listing = result.stdout.trim();
            if (!listing) {
                return null;
            }
            return listing;
        } catch (error) {
            this.logger.warn(
                `AiCodingAgent: gatherGeneralRepoContext failed — running without context: ${getErrorMessage(
                    error,
                )}`,
            );
            return null;
        }
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
        denyCiPaths,
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
        /** Reject the commit if it touches CI/workflow paths (general agent). */
        denyCiPaths: boolean;
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
                    denyCiPaths,
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
                denyCiPaths,
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
                // Bind the thread to the source it targeted so every resume
                // re-resolves to the same repo — one thread, one PR.
                projectDbtSourceUuid: turn.projectDbtSourceUuid,
                // Record the repo so a thread can resume its latest PR per repo.
                targetRepo: `${turn.gitConnection.owner}/${turn.gitConnection.repo}`,
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
