import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    type AiWritebackRunResult,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import type {
    AiWritebackFailureStage,
    LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import {
    createPullRequest,
    getInstallationToken,
} from '../../../clients/github/Github';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';

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

// Instructions prepended to every user prompt. The host owns git, so the agent
// must not touch it; instead it leaves the PR title/description on disk.
//
// When the agent makes file changes it must also run \`lightdash compile\` so the
// host (and reviewer) can see whether the resulting dbt project still parses.
// The compile uses --skip-warehouse-catalog so no live warehouse connection is
// needed; profiles.yml is patched in a temporary copy (env_var(...) and other
// Jinja expressions stripped) so dbt's profile-parsing step doesn't fail on
// unset variables. The original profiles.yml in the checkout must NOT be
// touched — \`git add --all\` runs after the agent and would otherwise sweep
// the patched file into the PR.
const SYSTEM_PROMPT = `
You are an autonomous coding agent working inside a checkout of a git repository.

- The repository is already cloned in your working directory. Edit the
  appropriate files to satisfy the user's request.
- Do NOT commit, push, or run any git commands — the host handles git.

If you made any file changes, perform ALL of these follow-up steps before you
finish:

1. Discover the dbt project directory by locating the file \`dbt_project.yml\`
   (search the repo; common locations are \`./dbt_project.yml\` or
   \`./dbt/dbt_project.yml\`). The directory that contains it is the
   \`--project-dir\`.

2. Discover the profiles directory by locating \`profiles.yml\` (common
   locations are \`./profiles/profiles.yml\` or alongside \`dbt_project.yml\`).
   The directory that contains it is the original profiles directory.

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
       --project-dir <discovered dbt project dir>
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
};

export class AiWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
        githubAppInstallationsModel,
    }: AiWritebackServiceDeps) {
        super({ serviceName: 'AiWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
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
     * Resolve a GitHub App installation access token for the user's
     * organization. The token authenticates the in-sandbox clone/push and the
     * pull request creation. Throws if no installation exists.
     */
    private async getGithubInstallation(
        user: SessionUser,
    ): Promise<{ installationId: string; token: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        // getInstallationId throws NotFoundError when the org hasn't connected
        // the GitHub App (via /generalSettings/integrations).
        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                user.organizationUuid,
            );
        const token = await getInstallationToken(installationId!);
        return { installationId: installationId!, token };
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
     * Synchronously spin up a sandbox, clone the target repo, run the given
     * prompt through the Claude Code CLI, and — if the agent changed any files
     * — branch/commit/push and open a pull request. Returns the agent's text
     * output and the PR URL (or null when there were no changes). The sandbox
     * is always killed before returning so we never leak running containers.
     */
    async run(
        user: SessionUser,
        projectUuid: string,
        {
            owner,
            repo,
            prompt,
        }: { owner: string; repo: string; prompt: string },
    ): Promise<AiWritebackRunResult> {
        await this.assertEnabled(user);

        // Confirm the project exists (and the user can read it) before
        // spending money on a sandbox.
        await this.projectModel.getSummary(projectUuid);

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const eventBase = {
            organizationId: user.organizationUuid,
            projectId: projectUuid,
            owner,
            repo,
        };
        const startedAt = Date.now();
        this.analytics.track({
            event: 'ai_writeback.started',
            userId: user.userUuid,
            properties: eventBase,
        });

        // Track the current pipeline stage so a failure is attributed to it.
        let stage: AiWritebackFailureStage = 'install';
        let sandbox: Sandbox | undefined;
        try {
            const { installationId, token } =
                await this.getGithubInstallation(user);

            const e2bApiKey = this.getE2bApiKey();
            const anthropicApiKey = this.getAnthropicApiKey();

            stage = 'sandbox';
            sandbox = await Sandbox.create(TEMPLATE_NAME, {
                apiKey: e2bApiKey,
                timeoutMs: RUN_TIMEOUT_MS,
            });
            this.logger.info(
                `AiWriteback: sandbox created (sandboxId=${sandbox.sandboxId}, project=${projectUuid})`,
            );

            stage = 'clone';
            // Clone over HTTPS using the installation token as the password.
            const cloneUrl = `https://${REPO_HOST}/${owner}/${repo}.git`;
            await sandbox.git.clone(cloneUrl, {
                path: CWD,
                username: GIT_USERNAME,
                password: token,
            });

            // The default branch is whatever got checked out by the clone — it
            // becomes the PR base.
            const baseStatus = await sandbox.git.status(CWD);
            const baseBranch = baseStatus.currentBranch ?? 'main';

            // Write the system prompt and the user prompt to separate files so
            // arbitrary content (quotes, newlines, shell metacharacters) can't
            // break the command line. The system prompt is passed via
            // --append-system-prompt-file; only the user prompt is piped in.
            await sandbox.files.write(SYSTEM_PROMPT_PATH, SYSTEM_PROMPT);
            await sandbox.files.write(PROMPT_PATH, prompt);

            stage = 'agent';
            // Run the agent inside the repo so its edits land on the checkout.
            const result = await sandbox.commands.run(
                `cat ${PROMPT_PATH} | claude -p ` +
                    `--append-system-prompt-file ${SYSTEM_PROMPT_PATH} ` +
                    '--output-format text ' +
                    '--dangerously-skip-permissions',
                {
                    cwd: CWD,
                    timeoutMs: RUN_TIMEOUT_MS,
                    envs: { ANTHROPIC_API_KEY: anthropicApiKey },
                    onStderr: (chunk) => {
                        this.logger.debug(
                            `AiWriteback: claude stderr: ${chunk.trimEnd()}`,
                        );
                    },
                },
            );

            this.logger.info(
                `AiWriteback: run completed (sandboxId=${sandbox.sandboxId}, exit=${result.exitCode})`,
            );

            const status = await sandbox.git.status(CWD);
            if (!status.hasChanges) {
                this.logger.info(
                    `AiWriteback: no file changes — skipping PR (sandboxId=${sandbox.sandboxId})`,
                );
                this.analytics.track({
                    event: 'ai_writeback.completed',
                    userId: user.userUuid,
                    properties: {
                        ...eventBase,
                        exitCode: result.exitCode,
                        hasChanges: false,
                        prCreated: false,
                        totalDurationMs: Date.now() - startedAt,
                    },
                });
                return {
                    output: result.stdout,
                    exitCode: result.exitCode,
                    prUrl: null,
                };
            }

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

            const branch = `lightdash-ai-writeback/${Date.now()}`;
            stage = 'commit';
            await sandbox.git.createBranch(CWD, branch);
            await sandbox.git.add(CWD, { all: true });
            await sandbox.git.commit(CWD, title, {
                authorName: COMMIT_AUTHOR_NAME,
                authorEmail: COMMIT_AUTHOR_EMAIL,
            });
            stage = 'push';
            await sandbox.git.push(CWD, {
                remote: 'origin',
                branch,
                setUpstream: true,
                username: GIT_USERNAME,
                password: token,
            });

            stage = 'pull_request';
            const pr = await createPullRequest({
                owner,
                repo,
                title,
                body: description,
                head: branch,
                base: baseBranch,
                installationId,
            });

            this.logger.info(
                `AiWriteback: opened PR ${pr.html_url} (sandboxId=${sandbox.sandboxId})`,
            );

            this.analytics.track({
                event: 'ai_writeback.completed',
                userId: user.userUuid,
                properties: {
                    ...eventBase,
                    exitCode: result.exitCode,
                    hasChanges: true,
                    prCreated: true,
                    totalDurationMs: Date.now() - startedAt,
                },
            });

            return {
                output: result.stdout,
                exitCode: result.exitCode,
                prUrl: pr.html_url,
            };
        } catch (error) {
            this.analytics.track({
                event: 'ai_writeback.failed',
                userId: user.userUuid,
                properties: {
                    ...eventBase,
                    failureStage: stage,
                    errorMessage: getErrorMessage(error),
                    totalDurationMs: Date.now() - startedAt,
                },
            });
            throw error;
        } finally {
            if (sandbox) {
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
    }
}
