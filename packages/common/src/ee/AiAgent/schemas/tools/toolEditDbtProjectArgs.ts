import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';

export const AI_WRITEBACK_PENDING_GRACE_MS = 5 * 60 * 1000;

export const TOOL_EDIT_DBT_PROJECT_DESCRIPTION = [
    "Open or update a pull request that changes this project's semantic layer (dbt or Lightdash YAML): it edits the repository in an isolated sandbox, validates the semantic layer and opens the pull request on your behalf, so report it as your own work.",
    'Call it, in the same turn you decide to make the change, when the user asks for one in the repository (add or rename a metric, edit a dimension or model, update YAML metadata) or accepts one you offered. It is not for questions about data or code, nor for changes that can be made inside Lightdash, such as to saved charts and dashboards.',
    'It returns status "pending" once the run starts, and the pull request opens in the background a few minutes later: do not call it again to check on it. Until it opens, listWorkstreams shows the change as still being opened.',
].join(' ');

export const TOOL_WRITE_DESCRIPTION = [
    "Save a change to this project's semantic layer on this conversation's pull request, its draft: one call per change, in the same turn the person asks for it or accepts one you offered. The first save opens the pull request and later ones join it.",
    'It returns status "pending" once the save starts and finishes in the background: do not call it again to check on it. Until it is saved, pr.list in read shows it as a change still being saved. Check a save that adds a model or changes SQL with verify.',
].join(' ');

export const toolEditDbtProjectArgsSchema = z.object({
    prompt: z
        .string()
        .describe(
            'A self-contained instruction, written as a direct task: the target model or file when you know it, and the literal change (field names, types, descriptions, SQL). The sandbox does not see this conversation, so include every detail it needs. When the project has more than one dbt source, name the source or its owner/repo verbatim, or you will be asked to choose one.',
        ),
    prUrl: z
        .string()
        .nullable()
        .describe(
            "Full URL of an existing pull request to update instead (e.g. 'https://github.com/owner/repo/pull/123'): one the user pasted, or one of several this conversation opened (from listWorkstreams or an earlier editDbtProject result). It must be in this project's repository. Otherwise null.",
        ),
    startNewPullRequest: z
        .boolean()
        .nullable()
        .describe(
            'true opens a new pull request in this conversation for a change unrelated to the open one; null continues the most recent pull request. Ignored when prUrl is set.',
        ),
    requestedBy: z
        .enum(['user_asked', 'offer_accepted', 'agent_initiated'])
        .describe(
            'Who asked for this repository change: user_asked when the user asked for it in the repository, offer_accepted when the user said yes to a change you offered, agent_initiated when you decided it alone. An agent_initiated change is not opened: the tool tells you to make what the user asked for with the content tools and offer the repository change instead.',
        ),
});

/** Semantic Studio's variant: the change can come as a script, saved in seconds without a sandbox. */
export const toolEditDbtProjectCodeModeArgsSchema =
    toolEditDbtProjectArgsSchema.extend({
        script: z
            .string()
            .nullable()
            .describe(
                [
                    'JavaScript that makes the change, run against the repository before the pull request is opened. Paths are relative to the dbt project. Nothing is written unless the whole script succeeds and every changed YAML file passes the semantic layer schema; on failure the tool returns the error, so fix the script and call again.',
                    'API (synchronous, values are plain JSON): dbt.model(name) -> { yml, sql, keys } | null, where keys is the YAML path of that model;',
                    'yaml.get(path, keys), yaml.set(path, keys, value), yaml.push(path, keys, value) to append to a list, yaml.remove(path, keys);',
                    "keys is a list of mapping keys, list indexes, or { name } to pick the list item with that name, e.g. [...m.keys, 'columns', { name: '<column>' }, 'config', 'meta', 'metrics', '<metric>'];",
                    'set creates missing mappings, and edits keep comments and the rest of the file as it is;',
                    'repo.list(prefix?), repo.read(path), repo.write(path, text), repo.remove(path) for whole files such as a new model SQL; console.log(...) is returned with errors.',
                    'Follow where the file already keeps things (e.g. config.meta rather than meta when it uses that). Null when the change needs dbt to run, such as checking new SQL against the warehouse.',
                    'With a script, start prompt with a one-line summary under 72 characters, like a commit subject: it becomes the pull request title.',
                ].join(' '),
            ),
        note: z
            .string()
            .nullable()
            .describe(
                'The one thing about this change most worth checking, under 15 words, shown on its card; null when nothing is.',
            ),
        options: z
            .array(z.string().trim().min(1))
            .max(2)
            .describe(
                'At most two things the person might ask for next instead, each written as they would say it in under 8 words. Each shows as a button that sends it. Empty for none.',
            ),
    });

/** The line kept as the reply when a Studio save ends its turn on the card with nothing written. */
export const DBT_SAVE_CARD_REPLY = 'Saved the change to the draft.';

/** The note and offers a Studio save was called with, read back from its stored arguments; none on a call made before it carried them. */
export const getEditDbtProjectCardExtras = (
    toolArgs: unknown,
): { note: string | null; options: string[] } => {
    const parsed = z
        .object({
            note: z.string().nullable().default(null),
            options: z.array(z.string()).default([]),
        })
        .safeParse(toolArgs);
    return parsed.success ? parsed.data : { note: null, options: [] };
};

export const toolEditDbtProjectStructuredContentSchema = z.object({
    status: z
        .literal('pending')
        .describe(
            'The change has started in the background; the pull request is opened later and this tool must not be called again to check on it.',
        ),
});

export const toolEditDbtProjectMetadataSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('pending'),
        aiWritebackRunUuid: z.string(),
        // What a script save writes, one unified diff per file, shown while it runs. Nullish: sandbox saves and rows from before this field have none.
        diffs: z.array(z.string()).nullish(),
    }),
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
        // When the pull request was recorded ahead of its preview, as an ISO time; nullish once the preview is settled.
        previewPendingSince: z.string().nullish(),
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
        // Models whose files this turn changed. Nullish: older rows and non-Studio runs.
        changedModels: z.array(z.string()).nullish(),
        needsDbtSourceSelection: z.boolean().nullish(),
        dbtSourceOptions: z
            .array(
                z.object({
                    projectDbtSourceUuid: z.string(),
                    name: z.string(),
                    isPrimary: z.boolean(),
                    repository: z.string().nullable(),
                    branch: z.string().nullable(),
                    projectSubPath: z.string().nullable(),
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
                'bitbucket_token_missing',
                'unsupported_source_control',
                'pull_request_not_open',
                'git_write_permission',
                'unknown',
            ])
            .nullish(),
    }),
]);

export const toolEditDbtProjectOutputSchema = structuredToolOutputSchema({
    metadata: toolEditDbtProjectMetadataSchema,
    structuredContent: toolEditDbtProjectStructuredContentSchema,
    contentStatuses: z.enum(['success', 'pending']),
});

export type ToolEditDbtProjectArgs = z.infer<
    typeof toolEditDbtProjectArgsSchema
>;

export type ToolEditDbtProjectOutput = z.infer<
    typeof toolEditDbtProjectOutputSchema
>;

export type ToolEditDbtProjectStructuredContent = z.infer<
    typeof toolEditDbtProjectStructuredContentSchema
>;

/** The dbt save tool's names: editDbtProject, and write in Semantic Studio's builder. */
export const DBT_WRITE_TOOL_NAMES = ['editDbtProject', 'write'] as const;

export type DbtWriteToolName = (typeof DBT_WRITE_TOOL_NAMES)[number];

export const isDbtWriteToolName = (name: string): name is DbtWriteToolName =>
    DBT_WRITE_TOOL_NAMES.some((toolName) => toolName === name);

// Persisted metadata comes from the DB, so the schema check is a safeParse.
export const isToolEditDbtProjectResult = <
    T extends { toolType: string; toolName: string; metadata: unknown },
>(
    result: T,
): result is T & {
    toolType: 'built-in';
    toolName: DbtWriteToolName;
    metadata: z.infer<typeof toolEditDbtProjectMetadataSchema>;
} =>
    result.toolType === 'built-in' &&
    isDbtWriteToolName(result.toolName) &&
    toolEditDbtProjectMetadataSchema.safeParse(result.metadata).success;
