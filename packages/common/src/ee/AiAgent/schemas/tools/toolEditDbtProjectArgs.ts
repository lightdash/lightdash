import { z } from 'zod';

export const TOOL_EDIT_DBT_PROJECT_DESCRIPTION = [
    'Open or update a pull request that modifies the dbt project / Lightdash semantic layer for this project.',
    'Use this tool ONLY when the user asks to CHANGE something in the underlying repo — e.g. add or rename a metric, edit a dimension definition, modify a dbt model, update YAML metadata.',
    'Do NOT use this tool for read-only questions, querying data, exploring fields, or for changes that can be made inside Lightdash (use editContent for those).',
    'This tool applies the change on your behalf: it runs in an isolated sandbox, edits the repo, runs `lightdash compile`, and opens a pull request. The call is synchronous and can take several minutes. Treat the result as your own work when you report it to the user.',
    'If the user pastes a link to an existing pull request and asks to iterate on it, pass that link as prUrl so the change updates that PR instead of opening a duplicate.',
].join(' ');

export const toolEditDbtProjectArgsSchema = z.object({
    prompt: z
        .string()
        .nullable()
        .describe(
            'A focused, self-contained natural-language instruction describing exactly which files in the dbt project to change and how. The change is applied in a fresh sandbox that does not see this conversation, so include every detail it needs (model name, file path hints, the literal change to make). Do not include preamble or pleasantries. Pass null only when fromActiveChangeset is true, in which case this is ignored.',
        ),
    prUrl: z
        .string()
        .nullable()
        .describe(
            "If the user pasted a link to an existing GitHub pull request they want to UPDATE instead of opening a new one, put the full PR URL here (e.g. 'https://github.com/owner/repo/pull/123'). The PR must belong to this project's own dbt repository. Only set this when the user explicitly references an existing PR to edit; otherwise pass null to open a new pull request.",
        ),
    fromActiveChangeset: z
        .boolean()
        .describe(
            'Set to true when the user asks to write back, apply, or open a pull request FROM their changeset(s) — e.g. "create a PR from my changesets". The server then reads the project\'s active changeset and builds the writeback instructions deterministically from its structured changes, ignoring `prompt` (pass null). Leave false for ordinary free-text writeback requests where you compose `prompt` yourself.',
        ),
});

export const toolEditDbtProjectOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
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
            // Lightdash preview-environment URL, generated server-side for the
            // PR and surfaced as the card's "View preview" button. Nullish: the
            // run made no preview (non-GitHub, or creation failed) or the row
            // predates this field. Replaces the old PR-comment scraping.
            previewUrl: z.string().nullish(),
            // Ordered actions the sandbox took, surfaced as persistent step
            // rows under the writeback tool call. Generic shape (kind + label)
            // so the chat UI can group/render them without writeback knowledge.
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
                    'github_not_installed',
                    'gitlab_not_installed',
                    'unsupported_source_control',
                    'pull_request_not_open',
                    'git_write_permission',
                    'unknown',
                ])
                .nullish(),
        }),
    ]),
});

export type ToolEditDbtProjectArgs = z.infer<
    typeof toolEditDbtProjectArgsSchema
>;

export type ToolEditDbtProjectOutput = z.infer<
    typeof toolEditDbtProjectOutputSchema
>;

type ToolEditDbtProjectResultLike = {
    toolType: string;
    toolName: string;
    metadata:
        | ToolEditDbtProjectOutput['metadata']
        | Record<string, unknown>
        | null;
};

type ToolEditDbtProjectResult = ToolEditDbtProjectResultLike & {
    toolType: 'built-in';
    toolName: 'editDbtProject';
    metadata: ToolEditDbtProjectOutput['metadata'];
};

export const isToolEditDbtProjectResult = <
    T extends ToolEditDbtProjectResultLike,
>(
    result: T,
): result is T & ToolEditDbtProjectResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'editDbtProject' &&
    toolEditDbtProjectOutputSchema.shape.metadata.safeParse(result.metadata)
        .success;
