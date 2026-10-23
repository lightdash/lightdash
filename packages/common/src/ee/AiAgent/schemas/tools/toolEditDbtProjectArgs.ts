import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

export const AI_WRITEBACK_PENDING_GRACE_MS = 5 * 60 * 1000;

export const TOOL_EDIT_DBT_PROJECT_DESCRIPTION = [
    "Open or update a pull request that changes this project's semantic layer (dbt or Lightdash YAML): it edits the repository in an isolated sandbox, validates the semantic layer and opens the pull request on your behalf, so report it as your own work.",
    'Call it, in the same turn you decide to make the change, when the user asks for one in the repository (add or rename a metric, edit a dimension or model, update YAML metadata) or accepts one you offered. It is not for questions about data or code, nor for changes that can be made inside Lightdash, such as to saved charts and dashboards.',
    'It returns status "pending" once the run starts, and the pull request opens in the background: do not call it again to check on it.',
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
});

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

export const isToolEditDbtProjectResult = makeBuiltInToolResultGuard(
    'editDbtProject',
    toolEditDbtProjectMetadataSchema,
);
