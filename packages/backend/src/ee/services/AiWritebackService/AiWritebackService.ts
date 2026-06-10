import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    WarehouseTypes,
    type AiWritebackRunResult,
    type AiWritebackStep,
    type PullRequestWritebackAction,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ALL_TRAFFIC, CommandExitError, Sandbox, TimeoutError } from 'e2b';
import type {
    AiWritebackFailureStage,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import { getRepoDefaultBranch } from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GitlabAppInstallationsModel } from '../../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../../models/PullRequestsModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { BaseService } from '../../../services/BaseService';
import type {
    AiWritebackThreadModel,
    AiWritebackThreadWithPrUrl,
} from '../../models/AiWritebackThreadModel';
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
import { WritebackGitNotConnectedError } from './errors';
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
    AppliedChanges,
    CloneTarget,
    GitInstallation,
    SetStage,
    TurnContext,
    WarehouseSkillKey,
} from './types';
import {
    classifyToolStep,
    extractPrMetadata,
    formatWritebackStep,
    interpretAgentEvent,
    parseGithubConnection,
    parsePullNumber,
    progressTextForStage,
    resolvePrMetadataValue,
    resolveSandboxTemplateRef,
    splitStreamBuffer,
    summarizeToolInput,
} from './utils';

export type { AiWritebackRunArgs, AiWritebackSource } from './types';

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
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    aiWritebackThreadModel: AiWritebackThreadModel;
    pullRequestsModel: PullRequestsModel;
    prometheusMetrics?: PrometheusMetrics;
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly aiWritebackThreadModel: AiWritebackThreadModel;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private readonly githubProvider: GithubProvider;

    private readonly gitlabProvider: GitlabProvider;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
        githubAppInstallationsModel,
        gitlabAppInstallationsModel,
        aiWritebackThreadModel,
        pullRequestsModel,
        prometheusMetrics,
    }: AiWritebackServiceDeps) {
        super({ serviceName: 'AiWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.aiWritebackThreadModel = aiWritebackThreadModel;
        this.pullRequestsModel = pullRequestsModel;
        this.prometheusMetrics = prometheusMetrics;
        this.githubProvider = new GithubProvider({
            githubAppInstallationsModel,
            logger: this.logger,
        });
        this.gitlabProvider = new GitlabProvider({
            gitlabAppInstallationsModel,
            gitlabConfig: lightdashConfig.gitlab,
            logger: this.logger,
        });
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
    async getRepoReadAccess({
        user,
        projectUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<{
        owner: string;
        repo: string;
        branch: string;
        token: string;
        subPath: string;
    }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const project = await this.projectModel.get(projectUuid);
        // Reading repo source requires view:SourceCode (writeback requires the
        // stricter manage:SourceCode). Gate the read so the repoShell tool can't
        // expose dbt source to users without source-code access.
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
        const provider = this.getGitProvider(project.dbtConnection.type);
        if (provider.provider !== PullRequestProvider.GITHUB) {
            throw new WritebackGitNotConnectedError(
                provider.provider,
                'Repository read access is currently only supported for GitHub dbt connections',
            );
        }
        const connection = parseGithubConnection(project.dbtConnection);
        const installation = await this.githubProvider.resolveInstallation(
            user.organizationUuid,
        );
        if (installation.provider !== PullRequestProvider.GITHUB) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITHUB,
                'GitHub App is not installed for this organization',
            );
        }
        // Read the project's configured dbt branch so repoShell inspects the
        // same source the Lightdash project compiles from. Only fall back to the
        // repo's default branch when the project left the branch unset.
        const branch =
            connection.branch ||
            (await getRepoDefaultBranch({
                owner: connection.owner,
                repo: connection.repo,
                installationId: installation.installationId,
            }));
        return {
            owner: connection.owner,
            repo: connection.repo,
            branch,
            token: installation.token,
            // Scope the read-only VFS to the dbt project subdirectory so it
            // can't expose secrets/other files elsewhere in the repo. '.' (repo
            // root) means no scoping.
            subPath: connection.projectSubPath,
        };
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

    private getE2bApiKey(): string {
        const key = this.lightdashConfig.appRuntime.e2bApiKey;
        if (!key) {
            throw new MissingConfigError(
                'E2B API key is not configured (E2B_API_KEY)',
            );
        }
        return key;
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
        projectUuid: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const { e2bAiWritebackTemplateName, e2bAiWritebackTemplateTag } =
            this.lightdashConfig.appRuntime;
        const templateRef = resolveSandboxTemplateRef({
            name: e2bAiWritebackTemplateName,
            tag: e2bAiWritebackTemplateTag,
        });
        const sandbox = await Sandbox.create(templateRef, {
            timeoutMs: SANDBOX_TIMEOUT_MS,
            apiKey: this.getE2bApiKey(),
            lifecycle: { onTimeout: 'pause' },
            network: {
                allowOut: ['api.anthropic.com', 'github.com', 'gitlab.com'],
                denyOut: [ALL_TRAFFIC],
            },
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info('AI writeback sandbox created', {
            event: 'ai_writeback.sandbox.created',
            sandboxId: sandbox.sandboxId,
            projectUuid,
            template: templateRef,
            durationMs,
        });
        this.prometheusMetrics?.observeAiWritebackSandboxCreateDuration(
            durationMs,
        );
        return { sandbox, durationMs };
    }

    private async pauseSandbox(
        sandbox: Sandbox,
        projectUuid: string,
    ): Promise<void> {
        try {
            const start = performance.now();
            await sandbox.pause();
            const durationMs = AiWritebackService.elapsed(start);
            this.logger.info('AI writeback sandbox paused', {
                event: 'ai_writeback.sandbox.lifecycle',
                action: 'paused',
                sandboxId: sandbox.sandboxId,
                projectUuid,
                durationMs,
            });
        } catch (error) {
            this.logger.warn('AI writeback failed to pause sandbox', {
                event: 'ai_writeback.sandbox.pause_failed',
                sandboxId: sandbox.sandboxId,
                projectUuid,
                errorMessage: getErrorMessage(error),
            });
        }
    }

    private async resumeSandbox(
        sandboxId: string,
        projectUuid: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const sandbox = await Sandbox.connect(sandboxId, {
            apiKey: this.getE2bApiKey(),
            timeoutMs: SANDBOX_TIMEOUT_MS,
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info('AI writeback sandbox resumed', {
            event: 'ai_writeback.sandbox.lifecycle',
            action: 'resumed',
            sandboxId: sandbox.sandboxId,
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
        sandbox: Sandbox,
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
        sandbox: Sandbox,
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

        let sandbox: Sandbox | undefined;
        // Default to preserving a resumed sandbox through failures — its
        // sandbox_id is referenced by an ai_writeback_thread row and killing
        // it would poison the row for every future turn. Fresh turns have no
        // such row, so the default kill is fine.
        let pauseOnExit = turn.isResume;
        try {
            const installation = await turn.provider.resolveInstallation(
                turn.organizationUuid,
            );

            const adoptedPr =
                !turn.existingRow && prUrl
                    ? await turn.provider.adoptPullRequest({
                          prUrl,
                          connection: turn.gitConnection,
                          installation,
                      })
                    : null;

            sandbox = await this.acquireSandbox({
                projectUuid,
                cloneTarget: turn.provider.getCloneTarget(
                    turn.gitConnection,
                    installation,
                ),
                existingRow: turn.existingRow,
                adoptBranch: adoptedPr?.headRef ?? null,
                setStage,
            });

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
            });

            const {
                title: prTitle,
                description: prDescription,
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
                });
                const crashPrUrl =
                    turn.existingRow?.pr_url ?? adoptedPr?.prUrl ?? null;
                return {
                    output: sanitizedStdout,
                    exitCode: agent.exitCode,
                    prUrl: crashPrUrl,
                    // The agent crashed before pushing changes, so any PR here
                    // is a pre-existing one — never newly opened.
                    prAction: crashPrUrl ? 'updated' : null,
                    projectName: turn.projectName,
                    repository,
                    steps: stepLog,
                };
            }

            const applied = await this.applyAgentChanges({
                sandbox,
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
            });
            pauseOnExit = applied.pauseOnExit;

            tracker.completed({
                exitCode: agent.exitCode,
                hasChanges,
                prCreated: applied.prCreated,
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
            if (sandbox) {
                await this.releaseSandbox(sandbox, pauseOnExit, projectUuid);
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
        const existingRow = aiThreadUuid
            ? await this.aiWritebackThreadModel.findByAiThreadUuid(aiThreadUuid)
            : null;

        // `get()` returns the (de-sensitised) warehouse credentials with the
        // discriminant `type` intact. Null when the project has no warehouse
        // connection — the agent then gets `shared.md` only.
        const warehouseType = project.warehouseConnection?.type ?? null;

        return {
            organizationUuid: user.organizationUuid,
            projectName: project.name,
            provider,
            gitConnection,
            existingRow,
            isResume: existingRow !== null,
            warehouseType,
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
            }) =>
                this.analytics.track({
                    event: 'ai_writeback.completed',
                    userId: user.userUuid,
                    properties: {
                        ...eventBase,
                        ...props,
                        totalDurationMs: Date.now() - startedAt,
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
        projectUuid,
        cloneTarget,
        existingRow,
        adoptBranch,
        setStage,
    }: {
        projectUuid: string;
        cloneTarget: CloneTarget;
        existingRow: AiWritebackThreadWithPrUrl | null;
        adoptBranch: string | null;
        setStage: SetStage;
    }): Promise<Sandbox> {
        setStage('sandbox');

        if (existingRow) {
            try {
                const { sandbox } = await this.resumeSandbox(
                    existingRow.sandbox_id,
                    projectUuid,
                );
                return sandbox;
            } catch (error) {
                // The persisted sandbox is gone (reaped by E2B, or some other
                // permanent failure). Clear the row so the next turn starts
                // fresh instead of looping on the same dead reference.
                this.logger.warn(
                    `AiWriteback: failed to resume sandbox ${existingRow.sandbox_id} — clearing conversation row (ai_thread_uuid=${existingRow.ai_thread_uuid}): ${getErrorMessage(error)}`,
                );
                await this.aiWritebackThreadModel.deleteByAiThreadUuid(
                    existingRow.ai_thread_uuid,
                );
                throw new ParameterError(
                    'This writeback conversation has expired. Please start a new one.',
                );
            }
        }

        const { sandbox } = await this.createSandbox(projectUuid);

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
        return sandbox;
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
        sandbox: Sandbox,
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
        sandbox: Sandbox,
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
    }: {
        sandbox: Sandbox;
        systemPrompt: string;
        prompt: string;
        isResume: boolean;
        source: AiWritebackSource;
        recordStep: (step: AiWritebackStep) => void;
        skillKey: WarehouseSkillKey | null;
        warehouseType: WarehouseTypes | null;
    }): Promise<{ stdout: string; exitCode: number }> {
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
        // Time each compile and append `<elapsedMs> <exitCode>` to a log we read
        // after the run. We drop `exec` (one extra shell frame) so the timing
        // can be recorded after the child returns; secrets are still stripped via
        // `env -u` for the compile child, so the security property is unchanged.
        await sandbox.files.write(
            COMPILE_WRAPPER_PATH,
            `#!/usr/bin/env bash\n` +
                `__ld_start=$(date +%s%3N)\n` +
                `env ${unsetFlags} lightdash compile "$@"\n` +
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
                this.logger.info(
                    `AI writeback agent run summary (wall=${
                        interpreted.durationMs ?? '?'
                    }ms, api=${interpreted.durationApiMs ?? '?'}ms, local=${
                        localToolMs ?? '?'
                    }ms, turns=${interpreted.numTurns ?? '?'}, cost=$${
                        interpreted.costUsd ?? '?'
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
            // e2b throws TimeoutError when RUN_TIMEOUT_MS fires, and
            // CommandExitError when the claude subprocess returns a non-zero
            // exit code. Both reach Sentry as the bare message ("exit status
            // 1") with no stderr — useless for debugging. Capture here so the
            // rich context (timeout flag, exit code, stderr tail) is attached
            // before the error bubbles up to the outer wrapSentryTransaction
            // catch (Sentry's Dedupe integration collapses the two events).
            const timedOut = error instanceof TimeoutError;
            const exitCode =
                error instanceof CommandExitError ? error.exitCode : null;
            // Prefer the error's stderr (e2b accumulates it server-side and
            // attaches it to CommandExitError) and fall back to our streamed
            // tail; both are clipped to STDERR_TAIL_BYTES so the payload stays
            // small.
            const errStderr =
                error instanceof CommandExitError ? (error.stderr ?? '') : '';
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

        return { stdout: assistantText, exitCode: result.exitCode };
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
    }: {
        sandbox: Sandbox;
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
    }): Promise<AppliedChanges> {
        if (!hasChanges) {
            this.logger.info(
                `AiWriteback: no file changes — skipping PR (sandboxId=${sandbox.sandboxId})`,
            );
            return {
                prUrl: turn.existingRow?.pr_url ?? adoptedPr?.prUrl ?? null,
                prCreated: false,
                pauseOnExit: turn.isResume,
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
                    sandbox,
                    prUrl: targetPrUrl,
                });
            }

            return {
                prUrl: targetPrUrl,
                prCreated: false,
                pauseOnExit: turn.existingRow
                    ? true
                    : aiThreadUuid !== undefined,
            };
        }

        const prUrl = await turn.provider.openPullRequest({
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
            sandbox,
            prUrl,
        });

        return {
            prUrl,
            prCreated: true,
            pauseOnExit: aiThreadUuid !== undefined,
        };
    }

    /**
     * Resolve the request title. Prefer the structured-output value parsed from
     * the agent's stdout; fall back to the file-based channel (and finally a
     * generic default) only when the agent failed to emit the structured block.
     * Provider-independent, so the provider receives a final string.
     */
    private resolvePrTitle(
        sandbox: Sandbox,
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
        sandbox: Sandbox,
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
        sandbox,
        prUrl,
    }: {
        turn: TurnContext;
        projectUuid: string;
        user: SessionUser;
        aiThreadUuid: string | undefined;
        sandbox: Sandbox;
        prUrl: string;
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
        });

        if (aiThreadUuid) {
            await this.aiWritebackThreadModel.create({
                aiThreadUuid,
                sandboxId: sandbox.sandboxId,
                pullRequestUuid: pullRequest.pullRequestUuid,
            });
        }
    }

    /**
     * Final sandbox disposition. Pause to preserve it for the next turn, or
     * kill (with a soft-fail log) to free resources for non-resumable runs.
     */
    private async releaseSandbox(
        sandbox: Sandbox,
        shouldPause: boolean,
        projectUuid: string,
    ): Promise<void> {
        if (shouldPause) {
            await this.pauseSandbox(sandbox, projectUuid);
            return;
        }
        try {
            await sandbox.kill();
        } catch (error) {
            this.logger.warn(
                `AiWriteback: failed to kill sandbox ${sandbox.sandboxId}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }
}
