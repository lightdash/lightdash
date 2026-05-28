import { subject } from '@casl/ability';
import {
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    ParameterError,
    type AiWritebackRunResult,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { Sandbox } from 'e2b';
import type {
    AiWritebackFailureStage,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import {
    createPullRequest,
    getInstallationToken,
    updatePullRequest,
} from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import type { DbAiWritebackThread } from '../../database/entities/ai';
import type { AiWritebackThreadModel } from '../../models/AiWritebackThreadModel';
import {
    ALLOWED_TOOLS,
    CLAUDE_MODEL,
    COMMIT_AUTHOR_EMAIL,
    COMMIT_AUTHOR_NAME,
    CWD,
    GIT_TIMEOUT_MS,
    GIT_USERNAME,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_DESCRIPTION_PATH,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
    PR_TITLE_PATH,
    PROMPT_PATH,
    RUN_TIMEOUT_MS,
    SANDBOX_TIMEOUT_MS,
    SYSTEM_PROMPT_PATH,
    TEMPLATE_NAME,
} from './constants';
import { buildSystemPrompt } from './templates';
import type {
    AiWritebackRunArgs,
    AppliedChanges,
    GithubConnection,
    GithubInstallation,
    SetStage,
    TurnContext,
} from './types';

export type { AiWritebackRunArgs } from './types';

type AiWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    aiWritebackThreadModel: AiWritebackThreadModel;
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly aiWritebackThreadModel: AiWritebackThreadModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
        githubAppInstallationsModel,
        aiWritebackThreadModel,
    }: AiWritebackServiceDeps) {
        super({ serviceName: 'AiWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.aiWritebackThreadModel = aiWritebackThreadModel;
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
        const key = this.lightdashConfig.ai.copilot.providers.anthropic?.apiKey;
        if (!key) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (ANTHROPIC_API_KEY)',
            );
        }
        return key;
    }

    /**
     * Resolve the target GitHub repository and dbt project sub-folder from a
     * Lightdash project's dbt connection. AI writeback clones over GitHub and
     * opens a PR via the GitHub App, so only GitHub-backed dbt connections are
     * supported.
     *
     * `repository` is stored as `owner/repo`. `project_sub_path` is the
     * sub-folder holding the dbt project, relative to the repo root (stored
     * with a leading slash, e.g. `/dbt`, and `/` for the repo root); it is
     * normalised to a path relative to the repo root (`dbt`, or `.` for the
     * root) so it can be passed straight to the compile's `--project-dir`.
     */
    private static resolveGithubConnection(connection: DbtProjectConfig): {
        owner: string;
        repo: string;
        projectSubPath: string;
    } {
        if (connection.type !== DbtProjectType.GITHUB) {
            throw new ParameterError(
                `AI writeback requires a GitHub dbt connection, but this project uses "${connection.type}"`,
            );
        }
        const [owner, repo] = connection.repository.split('/');
        if (!owner || !repo) {
            throw new ParameterError(
                `Project's dbt connection has an invalid repository "${connection.repository}" (expected "owner/repo")`,
            );
        }
        const relativeSubPath = connection.project_sub_path
            .trim()
            .replace(/^\/+/, '')
            .replace(/\/+$/, '');
        return {
            owner,
            repo,
            projectSubPath: relativeSubPath === '' ? '.' : relativeSubPath,
        };
    }

    /**
     * Resolve a GitHub App installation access token for the organization.
     * The token authenticates the in-sandbox clone/push and the pull request
     * creation. Throws if no installation exists.
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
        return { installationId, token };
    }

    private static elapsed(start: number): number {
        return Math.round(performance.now() - start);
    }

    private async createSandbox(
        projectUuid: string,
    ): Promise<{ sandbox: Sandbox; durationMs: number }> {
        const start = performance.now();
        const sandbox = await Sandbox.create(TEMPLATE_NAME, {
            timeoutMs: SANDBOX_TIMEOUT_MS,
            apiKey: this.getE2bApiKey(),
            lifecycle: { onTimeout: 'pause' },
        });
        const durationMs = AiWritebackService.elapsed(start);
        this.logger.info(
            `AiWriteback: sandbox created (sandboxId=${sandbox.sandboxId}, project=${projectUuid}, ${durationMs}ms)`,
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
            this.logger.info(
                `AiWriteback: sandbox paused (sandboxId=${sandbox.sandboxId}, project=${projectUuid}, ${durationMs}ms)`,
            );
        } catch (error) {
            this.logger.warn(
                `AiWriteback: failed to pause sandbox (sandboxId=${sandbox.sandboxId}, project=${projectUuid}): ${getErrorMessage(error)}`,
            );
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
        this.logger.info(
            `AiWriteback: sandbox resumed (sandboxId=${sandbox.sandboxId}, project=${projectUuid}, ${durationMs}ms)`,
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
        const fromTmpTrimmed = (fromTmp ?? '').trim();
        const fromRepoTrimmed = (fromRepo ?? '').trim();
        let source: 'tmp' | 'repo-fallback' | 'default' = 'default';
        if (fromTmpTrimmed.length > 0) {
            source = 'tmp';
        } else if (fromRepoTrimmed.length > 0) {
            source = 'repo-fallback';
        }
        this.logger.info(
            `AiWriteback: resolved PR metadata '${fileName}' from ${source}` +
                `${
                    source === 'repo-fallback'
                        ? ' (scrubbed stray repo copy so it cannot be committed)'
                        : ''
                } (sandboxId=${sandbox.sandboxId})`,
        );
        const resolved = fromTmpTrimmed || fromRepoTrimmed;
        return resolved.length > 0 ? resolved : fallback;
    }

    /**
     * Pull the PR title and description out of the agent's final stdout via
     * the structured-output delimiters, and return a copy of the stdout with
     * those blocks removed so they don't appear in the Slack reply. Either
     * field may be null when the agent failed to emit it — in that case the
     * caller falls back to the (less reliable) file-based metadata channel.
     */
    private extractPrMetadata(stdout: string): {
        title: string | null;
        description: string | null;
        sanitizedStdout: string;
    } {
        const escape = (s: string): string =>
            s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const titleRe = new RegExp(
            `${escape(PR_TITLE_OPEN)}([\\s\\S]*?)${escape(PR_TITLE_CLOSE)}`,
        );
        const descRe = new RegExp(
            `${escape(PR_DESCRIPTION_OPEN)}([\\s\\S]*?)${escape(
                PR_DESCRIPTION_CLOSE,
            )}`,
        );
        const title = stdout.match(titleRe)?.[1].trim() || null;
        const description = stdout.match(descRe)?.[1].trim() || null;
        const stripRe = new RegExp(
            `${escape(PR_TITLE_OPEN)}[\\s\\S]*?${escape(
                PR_TITLE_CLOSE,
            )}|${escape(PR_DESCRIPTION_OPEN)}[\\s\\S]*?${escape(
                PR_DESCRIPTION_CLOSE,
            )}`,
            'g',
        );
        const sanitizedStdout = stdout
            .replace(stripRe, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        this.logger.info(
            `AiWriteback: extracted PR metadata from stdout (title=${
                title !== null
            }, description=${description !== null})`,
        );
        return { title, description, sanitizedStdout };
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
        const { user, projectUuid, prompt, aiThreadUuid } = args;

        this.logger.info(
            `AiWriteback: agent run started (projectUuid=${projectUuid}, aiThreadUuid=${aiThreadUuid})`,
        );

        const turn = await this.prepareTurn({
            user,
            projectUuid,
            aiThreadUuid,
        });

        const repository = `${turn.githubConnection.owner}/${turn.githubConnection.repo}`;

        const tracker = this.startTracking({ user, projectUuid, turn });

        let failureStage: AiWritebackFailureStage = 'install';
        let stageStartedAt = Date.now();
        const setStage: SetStage = (stage) => {
            const now = Date.now();
            // Log every transition so a run reads as a timeline in the logs and
            // a stall is immediately attributable to the stage it happened in.
            this.logger.info(
                `AiWriteback: stage '${failureStage}' done in ${
                    now - stageStartedAt
                }ms → entering '${stage}' (aiThreadUuid=${
                    aiThreadUuid ?? 'none'
                })`,
            );
            failureStage = stage;
            stageStartedAt = now;
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
            sandbox = await this.acquireSandbox({
                projectUuid,
                githubConnection: turn.githubConnection,
                token: github.token,
                existingRow: turn.existingRow,
                setStage,
            });

            setStage('agent');
            const agent = await this.runAgentInSandbox({
                sandbox,
                prompt,
                projectSubPath: turn.githubConnection.projectSubPath,
                projectName: turn.projectName,
                repository,
                isResume: turn.isResume,
            });

            const {
                title: prTitle,
                description: prDescription,
                sanitizedStdout,
            } = this.extractPrMetadata(agent.stdout);

            const { hasChanges } = await sandbox.git.status(CWD);

            // The agent crashed mid-run. The working tree may be in a
            // partial/inconsistent state, so skip the push/PR side-effects
            // and surface the failure to the caller.
            if (agent.exitCode !== 0) {
                this.logger.warn(
                    `AiWriteback: agent exited non-zero (sandboxId=${sandbox.sandboxId}, exit=${agent.exitCode}) — skipping PR`,
                );
                tracker.completed({
                    exitCode: agent.exitCode,
                    hasChanges,
                    prCreated: false,
                });
                return {
                    output: sanitizedStdout,
                    exitCode: agent.exitCode,
                    prUrl: turn.existingRow?.pr_url ?? null,
                    projectName: turn.projectName,
                    repository,
                };
            }

            const applied = await this.applyAgentChanges({
                sandbox,
                github,
                hasChanges,
                turn,
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

            return {
                output: sanitizedStdout,
                exitCode: agent.exitCode,
                prUrl: applied.prUrl,
                projectName: turn.projectName,
                repository,
            };
        } catch (error) {
            this.logger.error(
                `AiWriteback: failed during stage '${failureStage}' (sandboxId=${
                    sandbox?.sandboxId ?? 'none'
                }): ${getErrorMessage(error)}`,
            );
            tracker.failed(failureStage, error);
            throw error;
        } finally {
            if (sandbox) {
                await this.releaseSandbox(sandbox, pauseOnExit, projectUuid);
            }
        }
    }

    /**
     * Pre-flight: enforce the feature flag, the project view permission, and
     * resolve everything from the request that doesn't require a sandbox.
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
        const canView = this.createAuditedAbility(user).can(
            'view',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        );
        if (!canView) {
            throw new ForbiddenError();
        }

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const githubConnection = AiWritebackService.resolveGithubConnection(
            project.dbtConnection,
        );

        // Resume only when both the caller supplied a thread uuid AND we
        // have a stored sandbox for it. Otherwise we start fresh.
        const existingRow = aiThreadUuid
            ? await this.aiWritebackThreadModel.findByAiThreadUuid(aiThreadUuid)
            : null;

        return {
            organizationUuid: user.organizationUuid,
            projectName: project.name,
            githubConnection,
            existingRow,
            isResume: existingRow !== null,
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
     * create a fresh sandbox and clone the repo into it.
     */
    private async acquireSandbox({
        projectUuid,
        githubConnection,
        token,
        existingRow,
        setStage,
    }: {
        projectUuid: string;
        githubConnection: GithubConnection;
        token: string;
        existingRow: DbAiWritebackThread | null;
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
        prompt,
        projectSubPath,
        projectName,
        repository,
        isResume,
    }: {
        sandbox: Sandbox;
        prompt: string;
        projectSubPath: string;
        projectName: string;
        repository: string;
        isResume: boolean;
    }): Promise<{ stdout: string; exitCode: number }> {
        await sandbox.files.write(
            SYSTEM_PROMPT_PATH,
            buildSystemPrompt(projectSubPath, { projectName, repository }),
        );
        await sandbox.files.write(PROMPT_PATH, prompt);

        const continueFlag = isResume ? '--continue ' : '';
        const result = await sandbox.commands.run(
            `cat ${PROMPT_PATH} | claude -p ${continueFlag}` +
                `--model ${CLAUDE_MODEL} ` +
                `--append-system-prompt-file ${SYSTEM_PROMPT_PATH} ` +
                '--output-format text ' +
                // Claude Code confines Write/Edit to the cwd workspace, so the
                // agent cannot write the PR metadata to /tmp (it silently falls
                // back to the repo root) unless /tmp is an added directory.
                '--add-dir /tmp ' +
                `--allowedTools "${ALLOWED_TOOLS}"`,
            {
                cwd: CWD,
                timeoutMs: RUN_TIMEOUT_MS,
                envs: { ANTHROPIC_API_KEY: this.getAnthropicApiKey() },
                onStderr: (chunk) => {
                    this.logger.debug(
                        `AiWriteback: claude stderr: ${chunk.trimEnd()}`,
                    );
                },
            },
        );
        this.logger.info(
            `AiWriteback: agent run completed (sandboxId=${sandbox.sandboxId}, exit=${result.exitCode}, isResume=${isResume})`,
        );
        return { stdout: result.stdout, exitCode: result.exitCode };
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
        turn,
        aiThreadUuid,
        setStage,
        prTitle,
        prDescription,
    }: {
        sandbox: Sandbox;
        github: GithubInstallation;
        hasChanges: boolean;
        turn: TurnContext;
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
                prUrl: turn.existingRow?.pr_url ?? null,
                prCreated: false,
                pauseOnExit: turn.isResume,
            };
        }

        if (turn.existingRow) {
            await this.updateExistingPullRequest({
                sandbox,
                existingRow: turn.existingRow,
                githubConnection: turn.githubConnection,
                installationId: github.installationId,
                token: github.token,
                setStage,
                prTitle,
                prDescription,
            });
            this.logger.info(
                `AiWriteback: updated PR ${turn.existingRow.pr_url} (sandboxId=${sandbox.sandboxId})`,
            );
            return {
                prUrl: turn.existingRow.pr_url,
                prCreated: false,
                pauseOnExit: true,
            };
        }

        const prUrl = await this.openInitialPullRequest({
            sandbox,
            githubConnection: turn.githubConnection,
            token: github.token,
            installationId: github.installationId,
            setStage,
            prTitle,
            prDescription,
        });
        this.logger.info(
            `AiWriteback: opened PR ${prUrl} (sandboxId=${sandbox.sandboxId})`,
        );

        if (aiThreadUuid) {
            await this.aiWritebackThreadModel.create({
                aiThreadUuid,
                sandboxId: sandbox.sandboxId,
                prUrl,
            });
        }

        return {
            prUrl,
            prCreated: true,
            pauseOnExit: aiThreadUuid !== undefined,
        };
    }

    /**
     * First conversational/one-shot turn that produced changes: read the
     * agent's chosen PR title/description, create a feature branch, commit,
     * push, and open a new pull request. Returns the new PR's URL.
     */
    private async openInitialPullRequest({
        sandbox,
        githubConnection,
        token,
        installationId,
        setStage,
        prTitle,
        prDescription,
    }: {
        sandbox: Sandbox;
        githubConnection: GithubConnection;
        token: string;
        installationId: string;
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

        setStage('commit');
        await sandbox.git.createBranch(CWD, branch);
        await this.stageChanges(sandbox, githubConnection.projectSubPath);
        await sandbox.git.commit(CWD, title, {
            authorName: COMMIT_AUTHOR_NAME,
            authorEmail: COMMIT_AUTHOR_EMAIL,
        });

        setStage('push');
        await sandbox.git.push(CWD, {
            remote: 'origin',
            branch,
            setUpstream: true,
            username: GIT_USERNAME,
            password: token,
        });

        setStage('pull_request');
        const pr = await createPullRequest({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            title,
            body: description,
            head: branch,
            base: baseBranch,
            installationId,
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
        existingRow,
        githubConnection,
        installationId,
        token,
        setStage,
        prTitle,
        prDescription,
    }: {
        sandbox: Sandbox;
        existingRow: DbAiWritebackThread;
        githubConnection: GithubConnection;
        installationId: string;
        token: string;
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

        setStage('commit');
        await this.stageChanges(sandbox, githubConnection.projectSubPath);
        await sandbox.git.commit(CWD, title, {
            authorName: COMMIT_AUTHOR_NAME,
            authorEmail: COMMIT_AUTHOR_EMAIL,
        });

        setStage('push');
        await sandbox.git.push(CWD, {
            remote: 'origin',
            username: GIT_USERNAME,
            password: token,
        });

        setStage('pull_request');
        await updatePullRequest({
            owner: githubConnection.owner,
            repo: githubConnection.repo,
            pullNumber: AiWritebackService.parsePullNumber(existingRow.pr_url),
            title,
            body: description,
            installationId,
        });
    }

    /** Extract the numeric PR id from a github.com/owner/repo/pull/<n> URL. */
    private static parsePullNumber(prUrl: string): number {
        const last = prUrl.split('/').pop();
        const n = last ? Number(last) : NaN;
        if (!Number.isInteger(n) || n <= 0) {
            throw new ParameterError(
                `Could not parse pull request number from URL: ${prUrl}`,
            );
        }
        return n;
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
