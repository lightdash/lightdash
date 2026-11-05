import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

export const toolEditRepoStructuredContentSchema = z.object({
    repository: z
        .string()
        .describe('The repository the change targeted, as "owner/repo".'),
    pullRequestAction: z
        .enum(['opened', 'updated'])
        .nullable()
        .describe(
            'Whether the run opened a new pull request or updated an existing one; null when it made no file changes, so no pull request was opened.',
        ),
    agentSummary: z
        .string()
        .describe("The coding agent's own summary of the change it made."),
});

export type ToolEditRepoStructuredContent = z.infer<
    typeof toolEditRepoStructuredContentSchema
>;

// Same envelope as `structuredToolOutputSchema`, spelled out because the
// metadata here is a discriminated union rather than a plain object.
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
    structuredContent: z.union([
        toolEditRepoStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolEditRepoOutput = z.infer<typeof toolEditRepoOutputSchema>;

export const isToolEditRepoResult = makeBuiltInToolResultGuard(
    'editRepo',
    toolEditRepoOutputSchema.shape.metadata,
);
