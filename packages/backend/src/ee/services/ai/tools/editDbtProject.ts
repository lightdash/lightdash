import {
    editDbtProjectToolDefinition,
    InsufficientGitPermissionsError,
    PullRequestProvider,
} from '@lightdash/common';
import { tool } from 'ai';
import {
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from '../../AiWritebackService/errors';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
};

type WritebackErrorCode =
    | 'github_not_installed'
    | 'gitlab_not_installed'
    | 'unsupported_source_control'
    | 'pull_request_not_open'
    | 'git_write_permission'
    | 'unknown';

// Sent to the agent on a 403 branch-creation failure: explains the fix and
// tells it not to retry.
const GIT_WRITE_PERMISSION_AGENT_MESSAGE = [
    'The change was prepared, but no pull request could be opened: this project’s Git connection does not have permission to create a branch (the host returned "Resource not accessible by integration").',
    'This is a one-time setup fix, NOT a transient error — do NOT retry, it will keep failing until the connection is fixed.',
    'Tell the user that an admin needs to either:',
    '1. Reconnect the dbt project to GitHub via the GitHub App (Project Settings → dbt connection → GitHub) instead of a personal access token. This is the recommended fix; or',
    '2. If they keep the personal access token, grant it write access to the repository (Contents: Read & write and Pull requests: Read & write).',
    'Once that is done they can ask you to try again. In the meantime, offer to give them the exact YAML patch to paste in manually so they are not blocked.',
].join('\n');

// Map a thrown writeback error to the metadata code the chat card renders.
// A not-connected error carries the expected git host, so the card can offer
// the matching install action; null means the project's dbt connection is not a
// supported source control type (e.g. local dbt, dbt Cloud, Bitbucket).
const classifyWritebackError = (error: unknown): WritebackErrorCode => {
    if (error instanceof WritebackGitNotConnectedError) {
        if (error.provider === PullRequestProvider.GITHUB) {
            return 'github_not_installed';
        }
        if (error.provider === PullRequestProvider.GITLAB) {
            return 'gitlab_not_installed';
        }
        return 'unsupported_source_control';
    }
    if (error instanceof WritebackThreadPrClosedError) {
        return 'pull_request_not_open';
    }
    if (error instanceof InsufficientGitPermissionsError) {
        return 'git_write_permission';
    }
    return 'unknown';
};

const toolDefinition = editDbtProjectToolDefinition.for('agent');

export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { prompt, prUrl: pastedPrUrl, fromActiveChangeset },
            { toolCallId },
        ) => {
            try {
                const {
                    prUrl,
                    prAction,
                    commitSha,
                    additions,
                    deletions,
                    output,
                    projectName,
                    repository,
                    previewDeployConfigured,
                    previewUrl,
                    steps,
                } = await editDbtProject({
                    prompt,
                    prUrl: pastedPrUrl,
                    fromActiveChangeset,
                    progressId: toolCallId,
                });

                // Surface which Lightdash project + repo were used so the
                // assistant can report it back and the user can catch a wrong
                // target. The PR URL is intentionally omitted here and exposed
                // only via the "View pull request" button (built from the
                // metadata below) — see the instruction in the success branch.
                const target = `Lightdash project "${projectName}" (repository ${repository})`;
                const prVerb = prAction === 'updated' ? 'Updated' : 'Opened';
                const base = prUrl
                    ? `${prVerb} a pull request against ${target}. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which project/repository it targeted.\n\nAgent summary:\n${output}`
                    : `Ran against ${target} but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                // Server-side preview: Lightdash built a preview project from
                // the PR's head branch and posted its URL on the PR — relay it
                // deterministically so the user can review the change before
                // merging. When no preview could be built and the repo has no
                // Lightdash preview-deploy GitHub Actions either, instruct the
                // assistant to offer setting that up instead.
                let result = base;
                if (prUrl && previewUrl) {
                    result += `\n\nA Lightdash preview environment was created from the pull request's branch: ${previewUrl} — include this link in your reply so the user can review the change in Lightdash before merging. Explores may take a minute to appear while the preview compiles.`;
                } else if (previewDeployConfigured === false) {
                    result += `\n\nIMPORTANT — also tell the user: this project does NOT have Lightdash preview deploys set up via GitHub Actions. Offer to set it up by opening a pull request that adds the preview workflow (a preview Lightdash project per PR, torn down on close). If they agree, call the \`setupPreviewDeploy\` tool. Do not call it unless they say yes.`;
                }

                return {
                    result,
                    metadata: {
                        status: 'success' as const,
                        prUrl: prUrl ?? null,
                        prAction: prAction ?? null,
                        commitSha: commitSha ?? null,
                        additions: additions ?? null,
                        deletions: deletions ?? null,
                        previewUrl: previewUrl ?? null,
                        steps,
                    },
                };
            } catch (error) {
                // A merged/closed thread PR is a terminal, expected state — not
                // a failure to retry. Surface its guidance verbatim (no "try
                // again" suffix, no Sentry noise) so the agent relays it.
                if (error instanceof WritebackThreadPrClosedError) {
                    return {
                        result: error.message,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'pull_request_not_open' as const,
                        },
                    };
                }
                // Terminal write-permission failure: relay the fix verbatim, no
                // retry suffix, no Sentry noise.
                if (error instanceof InsufficientGitPermissionsError) {
                    return {
                        result: GIT_WRITE_PERMISSION_AGENT_MESSAGE,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'git_write_permission' as const,
                        },
                    };
                }
                return {
                    result: toolErrorHandler(
                        error,
                        'Error running AI writeback. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                        errorCode: classifyWritebackError(error),
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
