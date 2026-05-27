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

type GithubConnection = {
    owner: string;
    repo: string;
    projectSubPath: string;
};

type GithubInstallation = {
    installationId: string;
    token: string;
};

type SetStage = (stage: AiWritebackFailureStage) => void;

type TurnContext = {
    organizationUuid: string;
    githubConnection: GithubConnection;
    existingRow: DbAiWritebackThread | null;
    isResume: boolean;
};

type AppliedChanges = {
    prUrl: string | null;
    prCreated: boolean;
    pauseOnExit: boolean;
};

export type AiWritebackRunArgs = {
    user: SessionUser;
    projectUuid: string;
    prompt: string;
    aiThreadUuid?: string;
};

const TEMPLATE_NAME = 'lightdash-ai-writeback';

const REPO_HOST = 'github.com';

// Where the repo is cloned inside the sandbox, and where the agent runs.
const CWD = '/home/user/repo';

const PROMPT_PATH = '/tmp/prompt.txt';
const SYSTEM_PROMPT_PATH = '/tmp/system_prompt.txt';
// Files the agent writes for the host to open a PR from.
const PR_TITLE_PATH = '/tmp/pr_title.txt';
const PR_DESCRIPTION_PATH = '/tmp/pr_description.md';

// Installation tokens authenticate over HTTPS with a fixed username.
const GIT_USERNAME = 'x-access-token';

// Commit identity for changes the agent produces.
const COMMIT_AUTHOR_NAME = 'Lightdash';
const COMMIT_AUTHOR_EMAIL = 'developers@lightdash.com';

// Hard ceiling on a single synchronous run. The HTTP request is held open for
// the duration, so keep this well under typical load-balancer/proxy timeouts.
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

// How long an E2B sandbox stays alive before E2B reaps it. Used both when
// creating a sandbox and when connecting to a paused one to keep it warm.
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

// Instructions prepended to every user prompt. The host owns git, so the agent
// must not touch it; instead it leaves the PR title/description on disk.
//
// `dbtProjectDir` is the dbt project sub-folder resolved from the Lightdash
// project's dbt connection (relative to the repo root, which is the agent's
// working directory). The agent uses it as the `--project-dir` for the compile
// rather than discovering it, so the compile targets the project the prompt is
// actually about.
//
// When the agent makes file changes it must also run `lightdash compile` so the
// host (and reviewer) can see whether the resulting dbt project still parses.
// The compile uses --skip-warehouse-catalog so no live warehouse connection is
// needed; profiles.yml is patched in a temporary copy (env_var(...) and other
// Jinja expressions stripped) so dbt's profile-parsing step doesn't fail on
// unset variables. The original profiles.yml in the checkout must NOT be
// touched — `git add --all` runs after the agent and would otherwise sweep
// the patched file into the PR.
const buildSystemPrompt = (dbtProjectDir: string): string =>
    `
You are an autonomous coding agent working inside a checkout of a git repository.

- The repository is already cloned in your working directory. Edit the
  appropriate files to satisfy the user's request.
- The dbt project lives at \`${dbtProjectDir}\` (relative to the repo root, which
  is your working directory).
- Do NOT commit, push, or run any git commands — the host handles git.

If you made any file changes, perform ALL of these follow-up steps before you
finish:

1. The dbt project directory (containing \`dbt_project.yml\`) is
   \`${dbtProjectDir}\`. Use it as the \`--project-dir\`.

2. Discover the profiles directory by locating \`profiles.yml\` (common
   locations are \`${dbtProjectDir}/profiles/profiles.yml\` or alongside
   \`dbt_project.yml\` in \`${dbtProjectDir}\`). The directory that contains it
   is the original profiles directory.

3. Prepare a TEMPORARY profiles directory at \`/tmp/ld-profiles\`:
   - Copy the discovered \`profiles.yml\` to \`/tmp/ld-profiles/profiles.yml\`.
   - In the COPY only, replace every Jinja \`env_var(...)\` expression — and
     any other Jinja expression that requires runtime values — with a literal
     placeholder string (e.g. \`"placeholder"\`). The goal is a syntactically
     valid profiles.yml that does not depend on any environment variable.
   - Do NOT modify the original \`profiles.yml\` in the repo. The host will
     commit every file change in the working tree, so the original must stay
     unchanged.

4. From the repo root, run:
     lightdash compile --skip-warehouse-catalog \\
       --profiles-dir /tmp/ld-profiles \\
       --project-dir ${dbtProjectDir}
   Capture the exit code and the last meaningful line of output.

5. In your final reply, include ONE line summarising the compile result —
   for example: "lightdash compile: ok (exit 0)" or
   "lightdash compile: failed (exit 1) — <short reason from stderr>". Do not
   paste the full compile output.

6. Write two files for the host to open a pull request from:
   - ${PR_TITLE_PATH}: a single-line PR title, plain text, no emojis, max 72 characters.
   - ${PR_DESCRIPTION_PATH}: a markdown PR description, plain text, no emojis.

If you did not change any files, skip steps 1–6 entirely and do not write
${PR_TITLE_PATH} or ${PR_DESCRIPTION_PATH}.
`.trim();

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

    /** Read a file the agent may or may not have written, with a fallback. */
    private static async readOptionalFile(
        sandbox: Sandbox,
        path: string,
        fallback: string,
    ): Promise<string> {
        try {
            const content = await sandbox.files.read(path);
            const trimmed = content.trim();
            return trimmed.length > 0 ? trimmed : fallback;
        } catch {
            return fallback;
        }
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

        console.log(args);
        const turn = await this.prepareTurn({
            user,
            projectUuid,
            aiThreadUuid,
        });

        const tracker = this.startTracking({ user, projectUuid, turn });

        let failureStage: AiWritebackFailureStage = 'install';
        const setStage: SetStage = (stage) => {
            failureStage = stage;
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
                isResume: turn.isResume,
            });

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
                    output: agent.stdout,
                    exitCode: agent.exitCode,
                    prUrl: turn.existingRow?.pr_url ?? null,
                };
            }

            const applied = await this.applyAgentChanges({
                sandbox,
                github,
                hasChanges,
                turn,
                aiThreadUuid,
                setStage,
            });
            pauseOnExit = applied.pauseOnExit;

            tracker.completed({
                exitCode: agent.exitCode,
                hasChanges,
                prCreated: applied.prCreated,
            });

            return {
                output: agent.stdout,
                exitCode: agent.exitCode,
                prUrl: applied.prUrl,
            };
        } catch (error) {
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
        await sandbox.git.clone(
            `https://${REPO_HOST}/${githubConnection.owner}/${githubConnection.repo}.git`,
            {
                path: CWD,
                username: GIT_USERNAME,
                password: token,
            },
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
        isResume,
    }: {
        sandbox: Sandbox;
        prompt: string;
        projectSubPath: string;
        isResume: boolean;
    }): Promise<{ stdout: string; exitCode: number }> {
        await sandbox.files.write(
            SYSTEM_PROMPT_PATH,
            buildSystemPrompt(projectSubPath),
        );
        await sandbox.files.write(PROMPT_PATH, prompt);

        const continueFlag = isResume ? '--continue ' : '';
        const result = await sandbox.commands.run(
            `cat ${PROMPT_PATH} | claude -p ${continueFlag}` +
                `--append-system-prompt-file ${SYSTEM_PROMPT_PATH} ` +
                '--output-format text ' +
                '--dangerously-skip-permissions',
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
    }: {
        sandbox: Sandbox;
        github: GithubInstallation;
        hasChanges: boolean;
        turn: TurnContext;
        aiThreadUuid: string | undefined;
        setStage: SetStage;
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
            await AiWritebackService.updateExistingPullRequest({
                sandbox,
                existingRow: turn.existingRow,
                githubConnection: turn.githubConnection,
                installationId: github.installationId,
                token: github.token,
                setStage,
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

        const prUrl = await AiWritebackService.openInitialPullRequest({
            sandbox,
            githubConnection: turn.githubConnection,
            token: github.token,
            installationId: github.installationId,
            setStage,
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
    private static async openInitialPullRequest({
        sandbox,
        githubConnection,
        token,
        installationId,
        setStage,
    }: {
        sandbox: Sandbox;
        githubConnection: GithubConnection;
        token: string;
        installationId: string;
        setStage: SetStage;
    }): Promise<string> {
        // The current branch right after clone is the default branch — that
        // becomes the PR base. Capture it before we branch off.
        const baseBranch =
            (await sandbox.git.status(CWD)).currentBranch ?? 'main';

        const title = await AiWritebackService.readOptionalFile(
            sandbox,
            PR_TITLE_PATH,
            'AI writeback changes',
        );
        const description = await AiWritebackService.readOptionalFile(
            sandbox,
            PR_DESCRIPTION_PATH,
            'Changes generated by the Lightdash AI writeback agent.',
        );

        const branch = `lightdash-ai-writeback/${randomUUID()}`;

        setStage('commit');
        await sandbox.git.createBranch(CWD, branch);
        await sandbox.git.add(CWD, { all: true });
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
    private static async updateExistingPullRequest({
        sandbox,
        existingRow,
        githubConnection,
        installationId,
        token,
        setStage,
    }: {
        sandbox: Sandbox;
        existingRow: DbAiWritebackThread;
        githubConnection: GithubConnection;
        installationId: string;
        token: string;
        setStage: SetStage;
    }): Promise<void> {
        const title = await AiWritebackService.readOptionalFile(
            sandbox,
            PR_TITLE_PATH,
            'AI writeback follow-up',
        );
        const description = await AiWritebackService.readOptionalFile(
            sandbox,
            PR_DESCRIPTION_PATH,
            'Follow-up changes from the Lightdash AI writeback agent.',
        );

        setStage('commit');
        await sandbox.git.add(CWD, { all: true });
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
