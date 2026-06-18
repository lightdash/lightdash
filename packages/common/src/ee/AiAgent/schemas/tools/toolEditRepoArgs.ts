import { z } from 'zod';

export const TOOL_EDIT_REPO_DESCRIPTION = [
    'Make a code change to one of the repositories your organization can write to, and open (or update) a pull request with it.',
    'Use this tool when the user asks to CHANGE code in a connected repository — e.g. fix a typo, edit a file, add a small feature — and wants a pull request raised on their behalf.',
    "This is the general-purpose counterpart to editDbtProject: editDbtProject is for changes to THIS project's dbt / semantic-layer repo (it also runs `lightdash compile`); editRepo targets ANY writable repo and does NOT run a build — verification happens via the pull request's own CI.",
    'The change is applied in an isolated sandbox that clones the target repo, edits files, and opens a pull request. The call is synchronous and can take several minutes. Treat the result as your own work when you report it to the user.',
    'Do NOT use this tool for read-only questions (use exploreRepo / discoverRepos), for querying data, or for changes that can be made inside Lightdash (use editContent).',
    'If the user pastes a link to an existing pull request and asks to iterate on it, pass that link as prUrl so the change updates that PR instead of opening a duplicate.',
].join(' ');

export const toolEditRepoArgsSchema = z.object({
    repoTarget: z
        .string()
        .describe(
            'The repository to edit, as "owner/repo" (e.g. "acme/web-app"). Must be a repository your organization\'s Git App installation can write to AND that you can access. Resolve the exact owner/repo first (e.g. via discoverRepos) rather than guessing.',
        ),
    prompt: z
        .string()
        .nullable()
        .describe(
            'A focused, self-contained natural-language instruction describing exactly which files in the repository to change and how. The change is applied in a fresh sandbox that does not see this conversation, so include every detail it needs (file path hints, the literal change to make). Do not include preamble or pleasantries.',
        ),
    prUrl: z
        .string()
        .nullable()
        .describe(
            "If the user pasted a link to an existing pull request they want to UPDATE instead of opening a new one, put the full PR URL here (e.g. 'https://github.com/owner/repo/pull/123'). The PR must belong to the same repoTarget. Only set this when the user explicitly references an existing PR to edit; otherwise pass null to open a new pull request.",
        ),
});

export const toolEditRepoOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            // The repository this turn targeted, as "owner/repo", so the card
            // can show it without re-deriving from the PR URL.
            repository: z.string().nullish(),
            prUrl: z.string().nullable(),
            // Nullish, not required: tool-call metadata is persisted, so cards
            // rendered from rows written before this field existed must still
            // parse. Absent/null is treated as 'opened' by the renderer.
            prAction: z.enum(['opened', 'updated']).nullish(),
            // Head commit SHA this turn pushed. The card pins its CI checks to
            // this SHA so a follow-up turn's commit doesn't retroactively change
            // an earlier card. Nullish: absent on rows persisted before this
            // existed (and when no commit was made) — the card then falls back
            // to the PR's live head.
            commitSha: z.string().nullish(),
            // Lines this turn's commit added/removed, shown colour-coded on the
            // card. Nullish for back-compat and no-commit turns.
            additions: z.number().nullish(),
            deletions: z.number().nullish(),
            // Ordered actions the sandbox took, surfaced as persistent step
            // rows under the tool call. Generic shape (kind + label) so the
            // chat UI can group/render them without coding-agent knowledge.
            // Nullish for back-compat with rows persisted before this existed.
            steps: z
                .array(
                    z.object({
                        kind: z.enum([
                            'read',
                            'edit',
                            'search',
                            'compile',
                            'stage',
                        ]),
                        label: z.string(),
                    }),
                )
                .nullish(),
        }),
        z.object({
            status: z.literal('error'),
            // Classifies the failure so the client can render a specific,
            // actionable error state instead of a generic "it failed". Nullish,
            // not required: persisted tool-call rows written before this field
            // existed must still parse — absent/null is treated as 'unknown'.
            errorCode: z
                .enum([
                    'repo_write_forbidden',
                    'github_not_installed',
                    'gitlab_not_installed',
                    'pull_request_not_open',
                    'git_write_permission',
                    'repo_too_large',
                    'denied_path',
                    'unknown',
                ])
                .nullish(),
            // Which authz/validation condition failed, for the forbidden state
            // (e.g. "not accessible to your user", "not installed", "protected
            // branch", "denylisted repo"). Surfaced so the card can tell the
            // user precisely why the edit was refused. Nullish for back-compat.
            reason: z.string().nullish(),
        }),
    ]),
});

export type ToolEditRepoArgs = z.infer<typeof toolEditRepoArgsSchema>;

export type ToolEditRepoOutput = z.infer<typeof toolEditRepoOutputSchema>;

type ToolEditRepoResultLike = {
    toolType: string;
    toolName: string;
    metadata: ToolEditRepoOutput['metadata'] | Record<string, unknown> | null;
};

type ToolEditRepoResult = ToolEditRepoResultLike & {
    toolType: 'built-in';
    toolName: 'editRepo';
    metadata: ToolEditRepoOutput['metadata'];
};

export const isToolEditRepoResult = <T extends ToolEditRepoResultLike>(
    result: T,
): result is T & ToolEditRepoResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'editRepo' &&
    toolEditRepoOutputSchema.shape.metadata.safeParse(result.metadata).success;
