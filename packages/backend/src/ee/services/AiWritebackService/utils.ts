import {
    assertUnreachable,
    DbtProjectType,
    isWorkflowFile,
    ParameterError,
    type DbtProjectConfig,
} from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import {
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';
import type {
    AgentPhase,
    AgentStreamEvent,
    AgentToolCall,
    AiWritebackSource,
    GithubConnection,
    GithubIdentity,
    PrMetadata,
    ResolvedPrMetadata,
    StagedFileChanges,
} from './types';

export const resolveGithubConnection = (
    connection: DbtProjectConfig,
): GithubConnection => {
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
    // Normalise the stored sub-path (leading slash, `/` for root) to a path
    // relative to the repo root so it can be passed to `--project-dir`.
    const relativeSubPath = connection.project_sub_path
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    return {
        owner,
        repo,
        projectSubPath: relativeSubPath === '' ? '.' : relativeSubPath,
    };
};

export const parsePullNumber = (prUrl: string): number => {
    const last = prUrl.split('/').pop();
    const pullNumber = last ? Number(last) : NaN;
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
        throw new ParameterError(
            `Could not parse pull request number from URL: ${prUrl}`,
        );
    }
    return pullNumber;
};

/** `null` opts a stage out of progress reporting (its label would be noise). */
export const progressTextForStage = (
    stage: AiWritebackFailureStage,
): string | null => {
    switch (stage) {
        case 'install':
            return 'Setting up';
        case 'sandbox':
            return 'Starting sandbox';
        case 'clone':
            return 'Cloning project';
        case 'agent':
            return 'Starting sub agent';
        case 'commit':
            return 'Committing changes';
        case 'push':
            return 'Pushing to GitHub';
        case 'pull_request':
            return null;
        default:
            return assertUnreachable(
                stage,
                `Unknown AiWritebackFailureStage: ${String(stage)}`,
            );
    }
};

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse the agent's PR title/description from the structured-output delimiters
 * in its stdout, and return the stdout with those blocks stripped so they don't
 * leak into the user-facing reply.
 */
export const extractPrMetadata = (stdout: string): PrMetadata => {
    const titleRe = new RegExp(
        `${escapeRegExp(PR_TITLE_OPEN)}([\\s\\S]*?)${escapeRegExp(
            PR_TITLE_CLOSE,
        )}`,
    );
    const descRe = new RegExp(
        `${escapeRegExp(PR_DESCRIPTION_OPEN)}([\\s\\S]*?)${escapeRegExp(
            PR_DESCRIPTION_CLOSE,
        )}`,
    );
    const title = stdout.match(titleRe)?.[1].trim() || null;
    const description = stdout.match(descRe)?.[1].trim() || null;
    const stripRe = new RegExp(
        `${escapeRegExp(PR_TITLE_OPEN)}[\\s\\S]*?${escapeRegExp(
            PR_TITLE_CLOSE,
        )}|${escapeRegExp(PR_DESCRIPTION_OPEN)}[\\s\\S]*?${escapeRegExp(
            PR_DESCRIPTION_CLOSE,
        )}`,
        'g',
    );
    const sanitizedStdout = stdout
        .replace(stripRe, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { title, description, sanitizedStdout };
};

/**
 * The agent has been observed writing PR metadata into the repo root instead of
 * /tmp, so a repo-root copy is accepted as a fallback (the caller scrubs it from
 * disk regardless so it can never reach a commit).
 */
export const resolvePrMetadataValue = ({
    fromTmp,
    fromRepo,
    fallback,
}: {
    fromTmp: string | null;
    fromRepo: string | null;
    fallback: string;
}): ResolvedPrMetadata => {
    const fromTmpTrimmed = (fromTmp ?? '').trim();
    const fromRepoTrimmed = (fromRepo ?? '').trim();
    if (fromTmpTrimmed.length > 0) {
        return { source: 'tmp', value: fromTmpTrimmed };
    }
    if (fromRepoTrimmed.length > 0) {
        return { source: 'repo-fallback', value: fromRepoTrimmed };
    }
    return { source: 'default', value: fallback };
};

/** Parse `git diff --cached --name-status --no-renames -z` into add/delete ops. */
export const parseGitNameStatus = (stdout: string): StagedFileChanges => {
    const parts = stdout.split('\0').filter((part) => part.length > 0);
    const addPaths: string[] = [];
    const deletions: { path: string }[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
        const status = parts[i];
        const path = parts[i + 1];
        if (status.startsWith('D')) {
            deletions.push({ path });
        } else {
            addPaths.push(path);
        }
    }
    return { addPaths, deletions };
};

export const parseTrackedWorkflowPaths = (stdout: string): string[] =>
    stdout
        .split('\n')
        .map((path) => path.trim())
        .filter((path) => path.length > 0 && isWorkflowFile(path));

/** Caller owns the side effects (logging, counting, progress). */
export const interpretAgentEvent = (event: unknown): AgentStreamEvent => {
    if (!event || typeof event !== 'object') return { type: 'ignored' };
    const typed = event as {
        type?: string;
        message?: { content?: unknown };
        total_cost_usd?: number;
    };
    if (typed.type === 'result') {
        return { type: 'result', costUsd: typed.total_cost_usd ?? null };
    }
    if (typed.type !== 'assistant') return { type: 'ignored' };
    const content = typed.message?.content;
    if (!Array.isArray(content)) {
        return { type: 'assistant', text: null, toolCalls: [] };
    }
    let messageText = '';
    const toolCalls: AgentToolCall[] = [];
    for (const block of content) {
        if (block && typeof block === 'object') {
            const typedBlock = block as {
                type?: string;
                text?: string;
                name?: string;
                input?: unknown;
            };
            if (
                typedBlock.type === 'text' &&
                typeof typedBlock.text === 'string'
            ) {
                messageText += typedBlock.text;
            } else if (
                typedBlock.type === 'tool_use' &&
                typeof typedBlock.name === 'string'
            ) {
                toolCalls.push({
                    name: typedBlock.name,
                    input: typedBlock.input,
                });
            }
        }
    }
    return { type: 'assistant', text: messageText || null, toolCalls };
};

export const classifyToolPhase = ({
    name,
    input,
}: AgentToolCall): AgentPhase | null => {
    if (name === 'Bash') {
        const command =
            input && typeof input === 'object'
                ? (input as { command?: unknown }).command
                : undefined;
        if (
            typeof command === 'string' &&
            command.includes('lightdash compile')
        ) {
            return 'compiling';
        }
        return null;
    }
    if (name === 'Edit' || name === 'Write') return 'editing';
    if (name === 'Read' || name === 'Glob' || name === 'Grep') {
        return 'discovering';
    }
    return null;
};

export const summarizeToolInput = (input: unknown): string => {
    if (input && typeof input === 'object') {
        const fields = input as Record<string, unknown>;
        if (typeof fields.file_path === 'string') return fields.file_path;
        if (typeof fields.command === 'string') {
            return fields.command.slice(0, 120);
        }
        if (typeof fields.pattern === 'string') return fields.pattern;
    }
    try {
        return JSON.stringify(input ?? null).slice(0, 120);
    } catch {
        return '<unserializable>';
    }
};

export const getPhaseProgressText = (
    source: AiWritebackSource,
): Record<AgentPhase, string> =>
    source === 'preview_deploy_setup'
        ? {
              discovering: 'Inspecting repository',
              editing: 'Writing workflow files',
              compiling: 'Validating workflow',
          }
        : {
              discovering: 'Discovering models',
              editing: 'Editing models',
              compiling: 'Compiling project',
          };

export const splitStreamBuffer = (
    buffer: string,
): { lines: string[]; remainder: string } => {
    const parts = buffer.split('\n');
    const remainder = parts.pop() ?? '';
    return { lines: parts, remainder };
};

/** GitHub noreply email — links the commit to the profile without the real address. */
export const buildNoreplyEmail = ({ id, login }: GithubIdentity): string =>
    `${id}+${login}@users.noreply.github.com`;

export const buildCoAuthorTrailer = (bot: GithubIdentity): string =>
    `Co-authored-by: ${bot.login} <${buildNoreplyEmail(bot)}>`;

/** E2B treats `name` and `name:default` interchangeably, so an empty tag is fine. */
export const resolveSandboxTemplateRef = ({
    name,
    tag,
}: {
    name: string;
    tag: string;
}): string => (tag ? `${name}:${tag}` : name);
