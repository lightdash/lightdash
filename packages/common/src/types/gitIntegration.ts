import type {
    AiAgentReviewItemStatus,
    AiAgentRootCause,
} from '../ee/AiAgent/aiAgentReviewClassifierTypes';
import { type KnexPaginatedData } from './knex-paginate';

export type GitIntegrationConfiguration = {
    enabled: boolean;
    installationId?: string;
};

export type PullRequestCreated = {
    prTitle: string;
    prUrl: string;
};

export type PullRequestReviewContext = {
    reviewItemUuid: string;
    reviewItemFingerprint: string;
    reviewTitle: string;
    reviewStatus: AiAgentReviewItemStatus;
    primaryRootCause: AiAgentRootCause;
    sourceFindingUuid: string;
    sourceThreadUuid: string;
    sourceProjectUuid: string;
    sourceAgentUuid: string;
};

export enum PullRequestProvider {
    GITHUB = 'github',
    GITLAB = 'gitlab',
}

export enum PullRequestSource {
    CUSTOM_METRIC = 'custom_metric',
    CUSTOM_DIMENSION = 'custom_dimension',
    SQL_RUNNER = 'sql_runner',
    SOURCE_EDITOR = 'source_editor',
    AI_AGENT = 'ai_agent',
}

export enum PullRequestState {
    OPEN = 'open',
    CLOSED = 'closed',
    MERGED = 'merged',
}

/**
 * A pull request created by a write-back. Only immutable identifiers are
 * persisted; the live title/state are resolved at runtime from the
 * GitHub/GitLab API using provider + owner + repo + prNumber.
 */
export type PullRequest = {
    pullRequestUuid: string;
    organizationUuid: string;
    projectUuid: string;
    createdByUserUuid: string | null;
    provider: PullRequestProvider;
    source: PullRequestSource;
    owner: string;
    repo: string;
    prNumber: number;
    prUrl: string;
    /**
     * Two-line user-facing "what this PR does", written by the AI write-back
     * agent at PR creation. Null for non-AI PRs and PRs predating the field —
     * consumers fall back to the live PR title.
     */
    summary: string | null;
    /**
     * The AI thread that produced this PR, when it originated from an AI
     * write-back (source `ai_agent`). Null for non-AI PRs, or in deployments
     * without the enterprise AI write-back feature.
     */
    aiThreadUuid: string | null;
    /**
     * The AI agent that owns the thread above. Paired with `aiThreadUuid` to
     * build the in-app thread link. Null whenever `aiThreadUuid` is null.
     */
    aiAgentUuid: string | null;
    /**
     * Source review context for AI review remediation PRs. Present when the PR
     * was opened to address a review finding.
     */
    reviewContext: PullRequestReviewContext | null;
    createdAt: Date;
};

/**
 * A stored pull request enriched with its live title/state resolved from the
 * provider API. `title`/`state` are null when the live lookup fails (e.g. the
 * PR was deleted or the token lost access) — `prUrl` always remains usable.
 */
export type PullRequestWithStatus = PullRequest & {
    title: string | null;
    state: PullRequestState | null;
};

/**
 * A user's personally linked GitHub account. When present, write-backs are
 * authored as this user instead of the Lightdash GitHub App bot.
 */
export type GithubUserCredential = {
    githubLogin: string;
    createdAt: Date;
};

export type ApiGithubUserCredentialResponse = {
    status: 'ok';
    results: GithubUserCredential | null;
};

/**
 * Advisory signal, resolved at AI prompt-assembly time, of which GitHub
 * identity an AI writeback PR would most likely be attributed to. This is a
 * cheap projection (one indexed DB read, no token refresh or GitHub API call) —
 * the authoritative resolution still happens later in the writeback run. Used to
 * give the agent context and, when unlinked, nudge the user to link a personal
 * GitHub account.
 *
 * - `personal`: the user has a linked personal GitHub account; the PR will be
 *   attributed to `githubLogin`.
 * - `org`: the PR will fall back to the shared org-level GitHub App. `canLink`
 *   is whether the user can link a personal account, i.e. whether nudging to
 *   settings is worthwhile.
 */
export type AiWritebackAttribution =
    | { mode: 'personal'; githubLogin: string }
    | { mode: 'org'; canLink: boolean };

export type ApiGitFileContent = {
    content: string;
    sha: string;
    filePath: string;
};

export type GitRepo = {
    name: string;
    fullName: string;
    ownerLogin: string;
    defaultBranch: string;
    // Which provider the repo lives on, so the UI can pick the right icon.
    // Optional for back-compat with existing GitRepo producers (setup endpoints).
    provider?: 'github' | 'gitlab';
};

export type GitFileEntry = {
    name: string;
    path: string;
    type: 'file' | 'dir';
    size: number;
    sha: string;
};

export type GitBranch = {
    name: string;
    /** TRUE if direct writes are blocked (GitHub protection OR project's configured branch) */
    isProtected: boolean;
};

// Discriminated union for file/directory responses
export type GitFileOrDirectory =
    | { type: 'directory'; entries: GitFileEntry[] }
    | { type: 'file'; content: string; sha: string; path: string };

export type ApiGitBranchesResponse = { status: 'ok'; results: GitBranch[] };
export type ApiGitFileOrDirectoryResponse = {
    status: 'ok';
    results: GitFileOrDirectory;
};
export type ApiGitFileSavedResponse = {
    status: 'ok';
    results: { sha: string; path: string };
};
export type ApiGitFileDeletedResponse = {
    status: 'ok';
    results: { deleted: true };
};

// Request body for creating a new branch
export type CreateGitBranchRequest = {
    name: string;
    sourceBranch: string;
};

// Response for created branch
export type ApiGitBranchCreatedResponse = {
    status: 'ok';
    results: GitBranch;
};

// Request body for creating a pull request
export type CreateGitPullRequestRequest = {
    title: string;
    description: string;
};

// Response for created pull request
export type ApiGitPullRequestCreatedResponse = {
    status: 'ok';
    results: PullRequestCreated;
};

// Response listing the pull requests created for a project, enriched with
// live title/state resolved from the provider API.
export type ApiPullRequestsResponse = {
    status: 'ok';
    results: KnexPaginatedData<PullRequestWithStatus[]>;
};

/**
 * The Lightdash preview environment for a pull request. `previewUrl` is null
 * until a preview has been published: the dbt repo's CI creates the preview
 * project asynchronously and comments its URL on the PR, so the URL can only be
 * discovered after the fact (it is not predictable from the PR itself).
 */
export type PullRequestPreview = {
    previewUrl: string | null;
};

export type ApiPullRequestPreviewResponse = {
    status: 'ok';
    results: PullRequestPreview;
};

/**
 * The project's source files, read from the read-only repo virtual file system
 * (the same VFS the agent's exploreRepo tool sees). Used by the chat input's
 * `@`-mention file picker. Paths are relative to the project's dbt sub-folder,
 * so an @-mentioned path is one the agent can act on directly. `truncated` is
 * true when the file tree exceeded the listing cap.
 */
export type ProjectFiles = {
    files: string[];
    truncated: boolean;
};

export type ApiProjectFilesResponse = {
    status: 'ok';
    results: ProjectFiles;
};

/**
 * The repositories the agent can read for a project, used by the chat input's
 * `@`-mention repository picker. This is the same union the agent's repo VFS
 * mounts (the org installation's repos plus the linked user's own), gated by the
 * project's `view:SourceCode` ability — unlike the org-wide `/github/repos/list`
 * endpoint, it never exposes repo names to users without source-code access.
 */
export type ApiProjectRepositoriesResponse = {
    status: 'ok';
    results: GitRepo[];
};

const PREVIEW_PROJECT_UUID =
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Find the Lightdash preview-environment URL inside a pull request's comments.
 *
 * When the AI write-back opens a PR against a dbt repo, that repo's CI runs
 * `lightdash preview`, which publishes a PREVIEW-type project and posts its URL
 * (`{siteUrl}/projects/{previewProjectUuid}/...`) as a PR comment. Only URLs on
 * this instance's own host are considered, so a link to github.com or an
 * unrelated site is never mistaken for a preview. Comments are scanned
 * newest-first, so a re-published preview wins. Returns null when none match.
 */
export const extractPreviewUrlFromComments = (
    commentBodies: string[],
    siteUrl: string,
): string | null => {
    let host: string;
    try {
        host = new URL(siteUrl).host;
    } catch {
        return null;
    }
    const escapedHost = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const previewUrlRegex = new RegExp(
        `https?://${escapedHost}/projects/${PREVIEW_PROJECT_UUID}(?:/[\\w-]+)*`,
        'i',
    );
    for (let i = commentBodies.length - 1; i >= 0; i -= 1) {
        const match = commentBodies[i].match(previewUrlRegex);
        if (match) {
            return match[0];
        }
    }
    return null;
};

export const extractPreviewProjectUuidFromUrl = (
    previewUrl: string,
    siteUrl: string,
): string | null => {
    try {
        const preview = new URL(previewUrl);
        const site = new URL(siteUrl);
        if (preview.host !== site.host) {
            return null;
        }
        const match = preview.pathname.match(
            new RegExp(`^/projects/(${PREVIEW_PROJECT_UUID})(?:/|$)`, 'i'),
        );
        return match?.[1] ?? null;
    } catch {
        return null;
    }
};
