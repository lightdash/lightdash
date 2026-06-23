import {
    assertUnreachable,
    DbtProjectType,
    ParameterError,
    PullRequestProvider,
    resolveDbtVersion,
    SupportedDbtVersions,
    type AiWritebackStep,
    type DbtProjectConfig,
    type DbtVersionOption,
} from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import {
    COMPILE_WRAPPER_PATH,
    DBT_VENV_BIN_PREFIX,
    PR_DESCRIPTION_CLOSE,
    PR_DESCRIPTION_OPEN,
    PR_SUMMARY_CLOSE,
    PR_SUMMARY_OPEN,
    PR_TITLE_CLOSE,
    PR_TITLE_OPEN,
} from './constants';
import type {
    AgentStreamEvent,
    AgentToolCall,
    CloneTarget,
    GitCommitAuthor,
    GitConnection,
    GithubConnection,
    GithubIdentity,
    GitlabConnection,
    PrMetadata,
    ResolvedPrMetadata,
    StagedFileChanges,
} from './types';

const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';

const splitOwnerRepo = (
    repository: string,
): { owner: string; repo: string } => {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
        throw new ParameterError(
            `Project's dbt connection has an invalid repository "${repository}" (expected "owner/repo")`,
        );
    }
    return { owner, repo };
};

/**
 * Normalise the stored sub-path (leading slash, `/` for root) to a path
 * relative to the repo root so it can be passed to `--project-dir`.
 */
const normalizeProjectSubPath = (projectSubPath: string): string => {
    const relative = projectSubPath
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    return relative === '' ? '.' : relative;
};

export const parseGithubConnection = (
    connection: DbtProjectConfig,
): GithubConnection => {
    if (connection.type !== DbtProjectType.GITHUB) {
        throw new ParameterError(
            `AI writeback requires a GitHub dbt connection, but this project uses "${connection.type}"`,
        );
    }
    const { owner, repo } = splitOwnerRepo(connection.repository);
    return {
        provider: PullRequestProvider.GITHUB,
        owner,
        repo,
        projectSubPath: normalizeProjectSubPath(connection.project_sub_path),
        branch: connection.branch?.trim() ?? '',
    };
};

export const parseGitlabConnection = (
    connection: DbtProjectConfig,
): GitlabConnection => {
    if (connection.type !== DbtProjectType.GITLAB) {
        throw new ParameterError(
            `AI writeback requires a GitLab dbt connection, but this project uses "${connection.type}"`,
        );
    }
    const { owner, repo } = splitOwnerRepo(connection.repository);
    return {
        provider: PullRequestProvider.GITLAB,
        owner,
        repo,
        projectSubPath: normalizeProjectSubPath(connection.project_sub_path),
        hostDomain: connection.host_domain || DEFAULT_GITLAB_HOST_DOMAIN,
    };
};

/**
 * HTTPS clone/push target for a connection. The token rides as the password so
 * it never appears in the URL string (and therefore never in logs). GitHub uses
 * the `x-access-token` username convention; GitLab OAuth uses `oauth2`.
 */
export const buildCloneTarget = (
    connection: GitConnection,
    token: string,
): CloneTarget => {
    switch (connection.provider) {
        case PullRequestProvider.GITHUB:
            return {
                url: `https://github.com/${connection.owner}/${connection.repo}.git`,
                username: 'x-access-token',
                password: token,
            };
        case PullRequestProvider.GITLAB:
            return {
                url: `https://${connection.hostDomain}/${connection.owner}/${connection.repo}.git`,
                username: 'oauth2',
                password: token,
            };
        default:
            return assertUnreachable(
                connection,
                'Unknown git provider for clone target',
            );
    }
};

/**
 * Parse a github.com pull request link (`.../owner/repo/pull/<n>`). Rejects
 * other hosts so a pasted link can't point the run at an unrelated repo.
 */
export const parsePullRequestUrl = (
    raw: string,
): { owner: string; repo: string; pullNumber: number } => {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new ParameterError(`"${raw}" is not a valid pull request URL.`);
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        throw new ParameterError(
            `Only github.com pull request links are supported (got "${url.hostname}").`,
        );
    }
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
        throw new ParameterError(
            `Could not parse a pull request from "${raw}". Expected a link like https://github.com/owner/repo/pull/123.`,
        );
    }
    const [, owner, repo, pullNumberStr] = match;
    const pullNumber = Number(pullNumberStr);
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
        throw new ParameterError(
            `Could not parse a valid pull request number from "${raw}".`,
        );
    }
    return { owner, repo, pullNumber };
};

/**
 * Parse a GitLab merge request link (`.../<group>/<project>/-/merge_requests/<n>`)
 * on the connection's host. Returns the project path verbatim so the caller can
 * compare it against the connection's `owner/repo`.
 */
export const parseMergeRequestUrl = (
    raw: string,
    hostDomain: string,
): { projectPath: string; mergeRequestIid: number } => {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new ParameterError(`"${raw}" is not a valid merge request URL.`);
    }
    if (url.hostname !== hostDomain) {
        throw new ParameterError(
            `Only ${hostDomain} merge request links are supported (got "${url.hostname}").`,
        );
    }
    const match = url.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (!match) {
        throw new ParameterError(
            `Could not parse a merge request from "${raw}". Expected a link like https://${hostDomain}/group/project/-/merge_requests/123.`,
        );
    }
    const [, projectPath, iidStr] = match;
    const mergeRequestIid = Number(iidStr);
    if (!Number.isInteger(mergeRequestIid) || mergeRequestIid <= 0) {
        throw new ParameterError(
            `Could not parse a valid merge request number from "${raw}".`,
        );
    }
    return { projectPath, mergeRequestIid };
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
            return 'Pushing changes';
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
    const summaryRe = new RegExp(
        `${escapeRegExp(PR_SUMMARY_OPEN)}([\\s\\S]*?)${escapeRegExp(
            PR_SUMMARY_CLOSE,
        )}`,
    );
    const title = stdout.match(titleRe)?.[1].trim() || null;
    const description = stdout.match(descRe)?.[1].trim() || null;
    const summary = stdout.match(summaryRe)?.[1].trim() || null;
    const stripRe = new RegExp(
        `${escapeRegExp(PR_TITLE_OPEN)}[\\s\\S]*?${escapeRegExp(
            PR_TITLE_CLOSE,
        )}|${escapeRegExp(PR_DESCRIPTION_OPEN)}[\\s\\S]*?${escapeRegExp(
            PR_DESCRIPTION_CLOSE,
        )}|${escapeRegExp(PR_SUMMARY_OPEN)}[\\s\\S]*?${escapeRegExp(
            PR_SUMMARY_CLOSE,
        )}`,
        'g',
    );
    const sanitizedStdout = stdout
        .replace(stripRe, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { title, description, summary, sanitizedStdout };
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

/** Caller owns the side effects (logging, counting, progress). */
export const interpretAgentEvent = (event: unknown): AgentStreamEvent => {
    if (!event || typeof event !== 'object') return { type: 'ignored' };
    const typed = event as {
        type?: string;
        message?: { content?: unknown };
        total_cost_usd?: number;
        duration_ms?: number;
        duration_api_ms?: number;
        num_turns?: number;
        // Token counts live nested under `usage` on the result event; the rest
        // are top-level. Same shape data apps reads in ClaudeStreamProcessor.
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
        };
    };
    if (typed.type === 'result') {
        const usage = typed.usage ?? {};
        return {
            type: 'result',
            costUsd: typed.total_cost_usd ?? null,
            durationMs: typed.duration_ms ?? null,
            durationApiMs: typed.duration_api_ms ?? null,
            numTurns: typed.num_turns ?? null,
            inputTokens: usage.input_tokens ?? null,
            outputTokens: usage.output_tokens ?? null,
            cacheReadInputTokens: usage.cache_read_input_tokens ?? null,
            cacheCreationInputTokens: usage.cache_creation_input_tokens ?? null,
        };
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

const toolStepBasename = (path: string): string => {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? path : path.slice(idx + 1);
};

/**
 * Classify one in-sandbox agent tool call into a generic {@link AiWritebackStep}
 * — a `kind` bucket (read/edit/search/compile) plus a `label` (file basename or
 * search pattern). Returns null for calls not worth surfacing (e.g. non-compile
 * Bash). The chat UI groups consecutive same-kind steps and renders them; the
 * shape is intentionally generic so the UI never needs writeback knowledge.
 */
export const classifyToolStep = ({
    name,
    input,
}: AgentToolCall): AiWritebackStep | null => {
    const fields =
        input && typeof input === 'object'
            ? (input as Record<string, unknown>)
            : {};
    const file =
        typeof fields.file_path === 'string'
            ? toolStepBasename(fields.file_path)
            : null;
    switch (name) {
        case 'Edit':
        case 'Write':
            return { kind: 'edit', label: file ?? 'files' };
        case 'Read':
            return { kind: 'read', label: file ?? 'files' };
        case 'Glob':
        case 'Grep':
            return {
                kind: 'search',
                label:
                    typeof fields.pattern === 'string'
                        ? fields.pattern
                        : 'files',
            };
        case 'Bash':
            // The agent compiles via the allowlisted wrapper, not `lightdash
            // compile` directly — match both so the (slow) compile surfaces a
            // step instead of a frozen gap before the commit stage.
            return typeof fields.command === 'string' &&
                (fields.command.includes(COMPILE_WRAPPER_PATH) ||
                    fields.command.includes('lightdash compile'))
                ? { kind: 'compile', label: 'project' }
                : null;
        default:
            return null;
    }
};

/**
 * One-line string for a step — used for the live progress stream (Slack's
 * pinned message, the web step stream) and as a dedup key. The persisted,
 * groupable form is the structured {@link AiWritebackStep} itself.
 */
export const formatWritebackStep = (step: AiWritebackStep): string => {
    switch (step.kind) {
        case 'read':
            return `Reading ${step.label}`;
        case 'edit':
            return `Editing ${step.label}`;
        case 'search':
            return `Searching for "${step.label}"`;
        case 'compile':
            return 'Compiling project';
        case 'stage':
            return step.label;
        default:
            return step.label;
    }
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

export type GitlabUserIdentity = {
    id: number;
    username: string;
    name: string | null;
    email: string | null;
};

/**
 * Commit author for a GitLab writeback. Falls back to a host-scoped noreply
 * address when the user's email is private (GitLab commits are unsigned, so
 * any valid author is accepted).
 */
export const buildGitlabCommitAuthor = (
    user: GitlabUserIdentity,
    hostDomain: string,
): GitCommitAuthor => ({
    name: user.name || user.username,
    email:
        user.email || `${user.id}-${user.username}@users.noreply.${hostDomain}`,
});

export const buildCoAuthorTrailer = (bot: GithubIdentity): string =>
    `Co-authored-by: ${bot.login} <${buildNoreplyEmail(bot)}>`;

/**
 * `Co-authored-by:` trailer crediting the Lightdash user who triggered the
 * writeback. The PR is opened by the app, so this is how the requesting user is
 * attributed on the commit. Returns null when we have no email to credit them by.
 */
export const buildUserCoAuthorTrailer = (user: {
    firstName: string;
    lastName: string;
    email: string | undefined;
}): string | null => {
    if (!user.email) return null;
    const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
    return `Co-authored-by: ${name} <${user.email}>`;
};

/** E2B treats `name` and `name:default` interchangeably, so an empty tag is fine. */
export const resolveSandboxTemplateRef = ({
    name,
    tag,
}: {
    name: string;
    tag: string;
}): string => (tag ? `${name}:${tag}` : name);

/**
 * Oldest dbt version installed in the sandbox image (see
 * sandboxes/ai-writeback/e2b.Dockerfile). We support 1.8+ only: 1.4–1.7 are
 * end-of-life and don't support the image's Python. Projects pinned below this
 * are clamped to it by `resolveSandboxDbtVersion`.
 */
export const SANDBOX_MIN_DBT_VERSION = SupportedDbtVersions.V1_8;

/**
 * Resolve a project's `DbtVersionOption` to a concrete version that is actually
 * installed in the sandbox: `latest` resolves to the newest supported version,
 * and anything older than `SANDBOX_MIN_DBT_VERSION` clamps up to it (rather than
 * pointing PATH at a venv the image doesn't contain). `SupportedDbtVersions` is
 * declared in ascending order, so an enum-index comparison gives the clamp.
 */
export const resolveSandboxDbtVersion = (
    option: DbtVersionOption,
): SupportedDbtVersions => {
    const resolved = resolveDbtVersion(option);
    const order = Object.values(SupportedDbtVersions);
    return order.indexOf(resolved) < order.indexOf(SANDBOX_MIN_DBT_VERSION)
        ? SANDBOX_MIN_DBT_VERSION
        : resolved;
};

/**
 * Absolute path to the `bin` directory of the sandbox venv for a given dbt
 * version. `SupportedDbtVersions` values are `v<major>.<minor>` (e.g. `v1.10`)
 * and the image installs each version at `${DBT_VENV_BIN_PREFIX}<major>.<minor>`
 * (e.g. `/usr/local/dbt1.10`), so we drop the leading `v`. The compile wrapper
 * prepends this to PATH so the bare `dbt` resolves to the project's version.
 * Callers must pass a sandbox-installed version (see `resolveSandboxDbtVersion`).
 */
export const dbtSandboxVenvBin = (version: SupportedDbtVersions): string =>
    `${DBT_VENV_BIN_PREFIX}${version.slice(1)}/bin`;
