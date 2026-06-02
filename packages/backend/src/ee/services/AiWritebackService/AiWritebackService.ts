import { subject } from '@casl/ability';
import {
    detectPreviewDeployWorkflow,
    FeatureFlags,
    ForbiddenError,
    generatePreviewDeployWorkflowFiles,
    getErrorMessage,
    getPreviewDeploySecrets,
    isUserWithOrg,
    MissingConfigError,
    ParameterError,
    PullRequestProvider,
    PullRequestSource,
    WarehouseTypes,
    type AiWritebackRunResult,
    type PreviewDeploySecret,
    type ProjectCiStatus,
    type SessionUser,
    type WorkflowFile,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'crypto';
import { CommandExitError, Sandbox, TimeoutError } from 'e2b';
import type {
    AiWritebackFailureStage,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getAppBotIdentity,
    getBranchHeadSha,
    getInstallationToken,
    updatePullRequest,
} from '../../../clients/github/Github';
import type { GithubFileChanges } from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { PullRequestsModel } from '../../../models/PullRequestsModel';
import { BaseService } from '../../../services/BaseService';
import { VERSION } from '../../../version';
import type {
    AiWritebackThreadModel,
    AiWritebackThreadWithPrUrl,
} from '../../models/AiWritebackThreadModel';
import type { ProjectCiStatusModel } from '../../models/ProjectCiStatusModel';
import {
    ALLOWED_TOOLS,
    CLAUDE_MODEL,
    CO_AUTHOR_TRAILER,
    COMMIT_AUTHOR_EMAIL,
    COMMIT_AUTHOR_NAME,
    COMPILE_STRIPPED_ENV_VARS,
    COMPILE_WRAPPER_PATH,
    CWD,
    GATHER_REPO_CONTEXT_SANDBOX_PATH,
    GIT_TIMEOUT_MS,
    GIT_USERNAME,
    PR_DESCRIPTION_PATH,
    PR_TITLE_PATH,
    PREVIEW_DEPLOY_SETUP_PROMPT,
    PROMPT_PATH,
    REPO_CONTEXT_TIMEOUT_MS,
    RUN_TIMEOUT_MS,
    SANDBOX_TIMEOUT_MS,
    SHARED_SKILL_PATH,
    SKILLS_DIR,
    STDERR_TAIL_BYTES,
    SYSTEM_PROMPT_PATH,
    WAREHOUSE_SKILL_PATH,
} from './constants';
import { resolveAdoptedPullRequest } from './pullRequest';
import { buildGatherRepoContextScript } from './scripts';
import { loadWarehouseSkills, warehouseTypeToSkillKey } from './skills';
import { buildSystemPrompt } from './templates';
import type {
    AdoptedPullRequest,
    AgentPhase,
    AiWritebackRunArgs,
    AiWritebackSource,
    AppliedChanges,
    GithubCommitAuthor,
    GithubConnection,
    GithubInstallation,
    SetStage,
    TurnContext,
    WarehouseSkillKey,
} from './types';
import {
    buildCoAuthorTrailer,
    classifyToolPhase,
    extractPrMetadata,
    getPhaseProgressText,
    interpretAgentEvent,
    parseGitNameStatus,
    parsePullNumber,
    parseTrackedWorkflowPaths,
    progressTextForStage,
    resolveGithubConnection,
    resolvePrMetadataValue,
    resolveSandboxTemplateRef,
    splitStreamBuffer,
    summarizeToolInput,
} from './utils';

export type { AiWritebackRunArgs, AiWritebackSource } from './types';

type AiWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    aiWritebackThreadModel: AiWritebackThreadModel;
    pullRequestsModel: PullRequestsModel;
    projectCiStatusModel: ProjectCiStatusModel;
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly aiWritebackThreadModel: AiWritebackThreadModel;

    private readonly pullRequestsModel: PullRequestsModel;

    private readonly projectCiStatusModel: ProjectCiStatusModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
        githubAppInstallationsModel,
        aiWritebackThreadModel,
        pullRequestsModel,
        projectCiStatusModel,
    }: AiWritebackServiceDeps) {
        super({ serviceName: 'AiWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.aiWritebackThreadModel = aiWritebackThreadModel;
        this.pullRequestsModel = pullRequestsModel;
        this.projectCiStatusModel = projectCiStatusModel;
    }

    private async assertEnabled(user: SessionUser): Promise<void> {
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

    /**
     * Resolve GitHub auth for the organization. The installation access token
     * authenticates the in-sandbox clone, and the pull request is opened — and
     * the signed commits authored — as the Lightdash GitHub App itself. We
     * deliberately do not attribute the PR to a GitHub user: the only user
     * token we hold belongs to whoever connected the app for the org, which is
     * almost never the person who triggered the writeback (e.g. via Slack), so
     * using it misattributes the PR. The triggering user is recorded against
     * the PR in our own DB instead (see recordWritebackPullRequest). Throws
     * only when no installation exists at all.
     */
    private async getGithubInstallation(
        organizationUuid: string,
    ): Promise<GithubInstallation> {
        // getInstallationId throws NotFoundError when the org hasn't connected
        // the GitHub App (via /generalSettings/integrations).
        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            throw new ForbiddenError(
                'GitHub App is not installed for this organization',
            );
        }
        const token = await getInstallationToken(installationId);

        const commitAuthor: GithubCommitAuthor = {
            name: COMMIT_AUTHOR_NAME,
            email: COMMIT_AUTHOR_EMAIL,
        };

        let coAuthorTrailer = CO_AUTHOR_TRAILER;
        try {
            const bot = await getAppBotIdentity(installationId);
            coAuthorTrailer = buildCoAuthorTrailer(bot);
        } catch (error) {
            this.logger.warn(
                `AiWriteback: could not resolve GitHub app bot identity for the co-author trailer; using the default. ${getErrorMessage(
                    error,
                )}`,
            );
        }

        return {
            installationId,
            token,
            commitAuthor,
            coAuthorTrailer,
        };
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
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info('AI writeback sandbox created', {
            event: 'ai_writeback.sandbox.created',
            sandboxId: sandbox.sandboxId,
            projectUuid,
            template: templateRef,
            durationMs,
        });
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
     * Stage the agent's changes for commit. We deliberately avoid
     * `git add --all`: the agent can leave scratch files (e.g. PR metadata) in
     * the working tree, and staging everything is how those leaked into PRs.
     * Instead we stage only the dbt project subtree the writeback is scoped to,
     * so anything outside it can never be committed. When the dbt project IS
     * the repo root we cannot narrow the path, so we fall back to staging all
     * and rely on resolvePrMetadata having scrubbed the known scratch files
     * before this runs.
     */
    private async stageChanges(
        sandbox: Sandbox,
        projectSubPath: string,
    ): Promise<void> {
        const scopedToProject = projectSubPath !== '.';
        this.logger.info(
            `AiWriteback: staging ${
                scopedToProject
                    ? `'${projectSubPath}'`
                    : 'all (dbt project is the repo root)'
            } (sandboxId=${sandbox.sandboxId})`,
        );
        await sandbox.git.add(
            CWD,
            scopedToProject ? { files: [projectSubPath] } : { all: true },
        );
        if (scopedToProject) {
            // Also stage Lightdash CI workflow files the agent may have added
            // when setting up preview deploys — they live at the repo root,
            // outside the dbt subtree. `.github/workflows` is a known-safe path
            // (never a scratch location); tolerate its absence when no
            // preview-deploy setup happened this turn.
            await sandbox.commands.run(
                `git -C ${CWD} add .github/workflows 2>/dev/null || true`,
            );
        }
    }

    /**
     * Read the staged changes out of the sandbox as a set of file additions and
     * deletions for a GitHub API commit. `-z` keeps paths NUL-separated so paths
     * with spaces survive; `--no-renames` collapses renames into delete + add so
     * each record is a simple (status, path) pair. Paths are repo-root-relative,
     * which is what `createCommitOnBranch` expects.
     */
    private static async collectFileChanges(
        sandbox: Sandbox,
    ): Promise<GithubFileChanges> {
        const { stdout } = await sandbox.commands.run(
            `git -C ${CWD} diff --cached --name-status --no-renames -z`,
        );
        const { addPaths, deletions } = parseGitNameStatus(stdout);
        const additions = await Promise.all(
            addPaths.map(async (path) => ({
                path,
                contents: Buffer.from(
                    await sandbox.files.read(`${CWD}/${path}`),
                    'utf-8',
                ).toString('base64'),
            })),
        );
        return { additions, deletions };
    }

    /**
     * Stage the agent's edits and commit them to `branch` via the GitHub API so
     * the commit is signed/verified and authored by the user (or the app, when
     * no user token is available). A local commit is also made — never pushed —
     * purely to advance the sandbox HEAD so a subsequent resume turn's staged
     * diff contains only that turn's edits.
     */
    private async commitChangesToBranch({
        sandbox,
        githubConnection,
        branch,
        expectedHeadOid,
        title,
        description,
        commitAuthor,
        coAuthorTrailer,
        installationId,
        setStage,
    }: {
        sandbox: Sandbox;
        githubConnection: GithubConnection;
        branch: string;
        expectedHeadOid: string;
        title: string;
        description: string;
        commitAuthor: GithubCommitAuthor;
        coAuthorTrailer: string;
        installationId: string;
        setStage: SetStage;
    }): Promise<void> {
        setStage('commit');
        await this.stageChanges(sandbox, githubConnection.projectSubPath);
        const fileChanges =
            await AiWritebackService.collectFileChanges(sandbox);
        await sandbox.git.commit(CWD, title, {
            authorName: commitAuthor.name,
            authorEmail: commitAuthor.email,
        });

        setStage('push');
        const body = description
            ? `${description}\n\n${coAuthorTrailer}`
            : coAuthorTrailer;
        await createSignedCommitOnBranch({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            branch,
            expectedHeadOid,
            headline: title,
            body,
            fileChanges,
            installationId,
        });
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
    /**
     * Secondary task of the writeback agent: while the repo is cloned in the
     * sandbox, detect whether it already deploys Lightdash preview projects via
     * GitHub Actions and persist the result. A project already recorded as set
     * up is not re-scanned. Best-effort — a failure here never blocks the
     * writeback run.
     */
    private async detectAndRecordPreviewDeploy(
        sandbox: Sandbox,
        projectUuid: string,
    ): Promise<ProjectCiStatus | null> {
        try {
            const existing =
                await this.projectCiStatusModel.findByProjectUuid(projectUuid);
            if (existing?.hasPreviewDeployWorkflow) {
                // Already set up — don't re-scan this project.
                return existing;
            }

            const { stdout: fileList } = await sandbox.commands.run(
                `git -C ${CWD} ls-files .github/workflows`,
            );
            const paths = parseTrackedWorkflowPaths(fileList);

            const files: WorkflowFile[] = await Promise.all(
                paths.map(async (path) => ({
                    path,
                    content: await sandbox.files.read(`${CWD}/${path}`),
                })),
            );

            const detection = detectPreviewDeployWorkflow(files);

            let detectedCommitSha: string | null = null;
            try {
                const { stdout } = await sandbox.commands.run(
                    `git -C ${CWD} rev-parse HEAD`,
                );
                detectedCommitSha = stdout.trim() || null;
            } catch {
                detectedCommitSha = null;
            }

            const status = await this.projectCiStatusModel.upsert({
                projectUuid,
                hasPreviewDeployWorkflow: detection.hasPreviewDeployWorkflow,
                workflowPath: detection.workflowPath,
                detectedCommitSha,
            });

            this.logger.info('AI writeback preview-deploy detection complete', {
                event: 'ai_writeback.preview_deploy.detected',
                projectUuid,
                hasPreviewDeployWorkflow: status.hasPreviewDeployWorkflow,
                workflowPath: status.workflowPath,
            });

            return status;
        } catch (error) {
            this.logger.warn(
                `AiWriteback: preview-deploy detection failed — ignoring: ${getErrorMessage(
                    error,
                )}`,
                {
                    event: 'ai_writeback.preview_deploy.failed',
                    projectUuid,
                },
            );
            return null;
        }
    }

    /**
     * Consent action behind the preview-deploy offer: open a dedicated pull
     * request that adds the Lightdash preview workflow. Runs a second sandbox
     * via run() with a synthetic prompt — the system prompt already carries the
     * exact files + secrets because detection finds the workflow missing — so
     * the workflow files land on their own PR, separate from any semantic-layer
     * change.
     *
     * `aiThreadUuid` enables conversational resume: passing the chat thread's
     * uuid lets follow-up requests ("also run on workflow_dispatch") update the
     * SAME pull request instead of opening a new one — same machinery as
     * proposeWriteback.
     */
    async setupPreviewDeploy(args: {
        user: SessionUser;
        projectUuid: string;
        aiThreadUuid?: string;
        onProgress?: (message: string) => void;
    }): Promise<AiWritebackRunResult & { secrets: PreviewDeploySecret[] }> {
        const { user, projectUuid, aiThreadUuid, onProgress } = args;
        // Explicit permission gate at this service entry point (it's reachable
        // directly as an agent tool). Mirrors the writeback manage:SourceCode
        // check; run()/prepareTurn re-checks before any side effect.
        const project = await this.projectModel.get(projectUuid);
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

        const result = await this.run({
            user,
            projectUuid,
            prompt: PREVIEW_DEPLOY_SETUP_PROMPT,
            source: 'preview_deploy_setup',
            aiThreadUuid,
            onProgress,
        });
        // Pre-fill the secrets we know server-side (instance URL + project UUID)
        // so the caller can surface concrete values, not generic descriptions.
        return {
            ...result,
            secrets: getPreviewDeploySecrets({
                projectUuid: args.projectUuid,
                siteUrl: this.lightdashConfig.siteUrl,
            }),
        };
    }

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

        const turn = await this.prepareTurn({
            user,
            projectUuid,
            aiThreadUuid,
        });

        this.logger.info('AI writeback run started', {
            event: 'ai_writeback.run.started',
            source,
            projectUuid,
            aiThreadUuid: aiThreadUuid ?? null,
            isResume: turn.isResume,
            warehouseType: turn.warehouseType,
        });

        const repository = `${turn.githubConnection.owner}/${turn.githubConnection.repo}`;

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
            failureStage = stage;
            stageStartedAt = now;
            // Stages can opt out of progress reporting by returning null
            // from progressTextForStage when their label would duplicate
            // the parent tool's heading or otherwise add no signal.
            const progressText = progressTextForStage(stage);
            if (progressText !== null) {
                reportProgress(progressText);
            }
        };

        let sandbox: Sandbox | undefined;
        // Default to preserving a resumed sandbox through failures — its
        // sandbox_id is referenced by an ai_writeback_thread row and killing
        // it would poison the row for every future turn. Fresh turns have no
        // such row, so the default kill is fine.
        let pauseOnExit = turn.isResume;
        try {
            const github = await this.getGithubInstallation(
                turn.organizationUuid,
            );

            const adoptedPr =
                !turn.existingRow && prUrl
                    ? await resolveAdoptedPullRequest({
                          prUrl,
                          githubConnection: turn.githubConnection,
                          github,
                      })
                    : null;

            sandbox = await this.acquireSandbox({
                projectUuid,
                githubConnection: turn.githubConnection,
                token: github.token,
                existingRow: turn.existingRow,
                adoptBranch: adoptedPr?.headRef ?? null,
                setStage,
            });

            // Secondary task: detect & record whether the repo already deploys
            // preview projects via GitHub Actions. Best-effort, never blocks.
            // Gated by its own ai-preview-deploy-setup flag (independent of the
            // ai-writeback flag that gates the run itself).
            const { enabled: previewDeploySetupEnabled } =
                await this.featureFlagModel.get({
                    user,
                    featureFlagId: FeatureFlags.AiPreviewDeploySetup,
                });
            // Only detect on a fresh clone. A resumed sandbox's working tree
            // carries the agent's prior-turn edits (e.g. workflow files it just
            // wrote), so detecting there is a false positive — detection must
            // reflect the cloned default-branch state, not in-progress changes.
            const previewDeployStatus =
                previewDeploySetupEnabled && !turn.isResume
                    ? await this.detectAndRecordPreviewDeploy(
                          sandbox,
                          projectUuid,
                      )
                    : null;
            // When it's not set up, hand the agent the exact files + secrets so
            // it can offer to open a PR adding the preview workflow.
            const previewDeployGuidance =
                previewDeployStatus &&
                !previewDeployStatus.hasPreviewDeployWorkflow
                    ? {
                          workflowFiles: generatePreviewDeployWorkflowFiles({
                              projectSubPath:
                                  turn.githubConnection.projectSubPath,
                              // Pin the CLI to this instance's own version —
                              // Lightdash packages release in lockstep, so it's
                              // the matching, self-updating @lightdash/cli pin.
                              cliVersion: VERSION,
                          }),
                          secrets: getPreviewDeploySecrets({
                              projectUuid,
                              siteUrl: this.lightdashConfig.siteUrl,
                          }),
                      }
                    : null;

            setStage('agent');
            const repoContext = await this.gatherRepoContext(
                sandbox,
                turn.githubConnection.projectSubPath,
            );
            const skillKey = warehouseTypeToSkillKey(turn.warehouseType);
            const systemPrompt = buildSystemPrompt(
                turn.githubConnection.projectSubPath,
                {
                    projectName: turn.projectName,
                    repository,
                    repoContext,
                    warehouseType: turn.warehouseType,
                    hasWarehouseSkill: skillKey !== null,
                    previewDeploy: previewDeployGuidance,
                },
            );
            const agent = await this.runAgentInSandbox({
                sandbox,
                systemPrompt,
                prompt,
                isResume: turn.isResume,
                source,
                reportProgress,
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
                return {
                    output: sanitizedStdout,
                    exitCode: agent.exitCode,
                    prUrl: turn.existingRow?.pr_url ?? adoptedPr?.prUrl ?? null,
                    projectName: turn.projectName,
                    repository,
                    previewDeployConfigured:
                        previewDeployStatus?.hasPreviewDeployWorkflow ?? null,
                };
            }

            const applied = await this.applyAgentChanges({
                sandbox,
                github,
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

            return {
                output: sanitizedStdout,
                exitCode: agent.exitCode,
                prUrl: applied.prUrl,
                projectName: turn.projectName,
                repository,
                previewDeployConfigured:
                    previewDeployStatus?.hasPreviewDeployWorkflow ?? null,
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
     * Pre-flight: enforce the feature flag, the `manage:SourceCode` permission,
     * and resolve everything from the request that doesn't require a sandbox.
     */
    private async prepareTurn({
        user,
        projectUuid,
        aiThreadUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        aiThreadUuid: string | undefined;
    }): Promise<TurnContext> {
        await this.assertEnabled(user);

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

        const githubConnection = resolveGithubConnection(project.dbtConnection);

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
            githubConnection,
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
            owner: turn.githubConnection.owner,
            repo: turn.githubConnection.repo,
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
        githubConnection,
        token,
        existingRow,
        adoptBranch,
        setStage,
    }: {
        projectUuid: string;
        githubConnection: GithubConnection;
        token: string;
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
        // Clone over HTTPS using the installation token as the password.
        // `depth: 1` keeps the clone shallow (we only need the tip to branch
        // off) and `timeoutMs` overrides the E2B SDK's 60s default, which a
        // slow clone was exceeding with `deadline_exceeded`.
        const cloneStartedAt = Date.now();
        await sandbox.git.clone(
            `https://github.com/${githubConnection.owner}/${githubConnection.repo}.git`,
            {
                path: CWD,
                username: GIT_USERNAME,
                password: token,
                depth: 1,
                timeoutMs: GIT_TIMEOUT_MS,
                ...(adoptBranch ? { branch: adoptBranch } : {}),
            },
        );
        this.logger.info(
            `AiWriteback: repo cloned (sandboxId=${sandbox.sandboxId}, ${
                Date.now() - cloneStartedAt
            }ms)`,
        );
        return sandbox;
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
        reportProgress,
        skillKey,
        warehouseType,
    }: {
        sandbox: Sandbox;
        systemPrompt: string;
        prompt: string;
        isResume: boolean;
        source: AiWritebackSource;
        reportProgress: (message: string) => void;
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
        await sandbox.files.write(
            COMPILE_WRAPPER_PATH,
            `#!/usr/bin/env bash\nexec env ${unsetFlags} lightdash compile "$@"\n`,
        );
        await sandbox.commands.run(`chmod +x ${COMPILE_WRAPPER_PATH}`);

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
        const phaseProgressText = getPhaseProgressText(source);
        const seenPhases = new Set<AgentPhase>();

        let stderrTail = '';
        const appendStderrTail = (chunk: string) => {
            stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
        };

        const handleEvent = (event: unknown): void => {
            const interpreted = interpretAgentEvent(event);
            if (interpreted.type === 'result') {
                this.logger.info('AI writeback agent run summary', {
                    event: 'ai_writeback.run.summary',
                    source,
                    sandboxId: sandbox.sandboxId,
                    costUsd: interpreted.costUsd,
                    warehouseType,
                    toolCounts,
                });
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
                const phase = classifyToolPhase(toolCall);
                if (phase && !seenPhases.has(phase)) {
                    seenPhases.add(phase);
                    reportProgress(phaseProgressText[phase]);
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
                    `--add-dir /tmp --add-dir ${SKILLS_DIR} ` +
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
        return { stdout: assistantText, exitCode: result.exitCode };
    }

    /**
     * Translate the agent's effect on the working tree into the right
     * GitHub side-effect and decide whether the sandbox should outlive this
     * turn. Three branches, no nesting:
     *
     * 1. No changes — nothing to push. Existing PR (if any) is the answer;
     *    keep the sandbox warm only when resuming.
     * 2. Resume + changes — push to the checked-out branch; existing PR
     *    auto-updates on GitHub.
     * 3. Fresh + changes — branch, commit, push, open the PR; persist the
     *    conversation row if the caller supplied an `aiThreadUuid`.
     */
    private async applyAgentChanges({
        sandbox,
        github,
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
        github: GithubInstallation;
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

        // Resume or pasted-link adoption: commit onto the existing PR's branch
        // (the sandbox is already on it) and refresh its title/description.
        if (turn.existingRow || adoptedPr) {
            const targetPrUrl = turn.existingRow?.pr_url ?? adoptedPr?.prUrl;
            if (!targetPrUrl) {
                throw new ParameterError(
                    'Cannot update pull request: the writeback thread is not linked to a pull request',
                );
            }
            await this.updateExistingPullRequest({
                sandbox,
                prUrl: targetPrUrl,
                githubConnection: turn.githubConnection,
                installationId: github.installationId,
                commitAuthor: github.commitAuthor,
                coAuthorTrailer: github.coAuthorTrailer,
                setStage,
                prTitle,
                prDescription,
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

        const prUrl = await this.openInitialPullRequest({
            sandbox,
            githubConnection: turn.githubConnection,
            installationId: github.installationId,
            commitAuthor: github.commitAuthor,
            coAuthorTrailer: github.coAuthorTrailer,
            setStage,
            prTitle,
            prDescription,
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
            provider: PullRequestProvider.GITHUB,
            source: PullRequestSource.AI_AGENT,
            owner: turn.githubConnection.owner,
            repo: turn.githubConnection.repo,
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
     * First conversational/one-shot turn that produced changes: read the
     * agent's chosen PR title/description, create a feature branch, commit,
     * push, and open a new pull request. Returns the new PR's URL.
     */
    private async openInitialPullRequest({
        sandbox,
        githubConnection,
        installationId,
        commitAuthor,
        coAuthorTrailer,
        setStage,
        prTitle,
        prDescription,
    }: {
        sandbox: Sandbox;
        githubConnection: GithubConnection;
        installationId: string;
        commitAuthor: GithubCommitAuthor;
        coAuthorTrailer: string;
        setStage: SetStage;
        prTitle: string | null;
        prDescription: string | null;
    }): Promise<string> {
        // The current branch right after clone is the default branch — that
        // becomes the PR base. Capture it before we branch off.
        const baseBranch =
            (await sandbox.git.status(CWD)).currentBranch ?? 'main';

        // Prefer the structured-output values parsed from the agent's stdout.
        // Fall back to the file-based channel (and finally a generic default)
        // only when the agent failed to emit the structured blocks.
        const title =
            prTitle ??
            (await this.resolvePrMetadata(
                sandbox,
                PR_TITLE_PATH,
                'AI writeback changes',
            ));
        const description =
            prDescription ??
            (await this.resolvePrMetadata(
                sandbox,
                PR_DESCRIPTION_PATH,
                'Changes generated by the Lightdash AI writeback agent.',
            ));

        const branch = `lightdash-ai-writeback/${randomUUID()}`;
        const auth = { installationId };

        // Create the feature branch on the remote at the base tip, then commit
        // onto it via the API so the commit is signed/verified. expectedHeadOid
        // is the base tip we just branched from.
        const baseOid = await getBranchHeadSha({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            branch: baseBranch,
            ...auth,
        });
        await createBranch({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            sha: baseOid,
            branch,
            ...auth,
        });
        await sandbox.git.createBranch(CWD, branch);

        await this.commitChangesToBranch({
            sandbox,
            githubConnection,
            branch,
            expectedHeadOid: baseOid,
            title,
            description,
            commitAuthor,
            coAuthorTrailer,
            installationId,
            setStage,
        });

        setStage('pull_request');
        // The PR is always opened by the Lightdash GitHub App installation.
        const pr = await createPullRequest({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            title,
            body: description,
            head: branch,
            base: baseBranch,
            ...auth,
        });
        return pr.html_url;
    }

    /**
     * Resume turn that produced changes: the feature branch is already
     * checked out from the prior turn. Read the agent's refreshed PR
     * title/description, commit + push to that branch (existing PR picks up
     * the commits automatically), then patch the PR's title and body so the
     * GitHub view stays in sync with the latest agent output.
     */
    private async updateExistingPullRequest({
        sandbox,
        prUrl,
        githubConnection,
        installationId,
        commitAuthor,
        coAuthorTrailer,
        setStage,
        prTitle,
        prDescription,
    }: {
        sandbox: Sandbox;
        prUrl: string;
        githubConnection: GithubConnection;
        installationId: string;
        commitAuthor: GithubCommitAuthor;
        coAuthorTrailer: string;
        setStage: SetStage;
        prTitle: string | null;
        prDescription: string | null;
    }): Promise<void> {
        const title =
            prTitle ??
            (await this.resolvePrMetadata(
                sandbox,
                PR_TITLE_PATH,
                'AI writeback follow-up',
            ));
        const description =
            prDescription ??
            (await this.resolvePrMetadata(
                sandbox,
                PR_DESCRIPTION_PATH,
                'Follow-up changes from the Lightdash AI writeback agent.',
            ));

        const auth = { installationId };

        // The sandbox is on the PR's branch (resumed, or freshly checked out
        // for a pasted link). Commit this turn's edits onto it via the API
        // (signed) using the branch's current remote tip as expectedHeadOid.
        const featureBranch = (await sandbox.git.status(CWD)).currentBranch;
        if (!featureBranch) {
            throw new ParameterError(
                'Cannot update pull request: the sandbox is not on a feature branch',
            );
        }
        const expectedHeadOid = await getBranchHeadSha({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            branch: featureBranch,
            ...auth,
        });

        await this.commitChangesToBranch({
            sandbox,
            githubConnection,
            branch: featureBranch,
            expectedHeadOid,
            title,
            description,
            commitAuthor,
            coAuthorTrailer,
            installationId,
            setStage,
        });

        setStage('pull_request');
        await updatePullRequest({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            pullNumber: parsePullNumber(prUrl),
            title,
            body: description,
            ...auth,
        });
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
