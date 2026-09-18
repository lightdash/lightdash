import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LIST_WORKSTREAMS_DESCRIPTION = [
    'List the pull requests this conversation has already opened with the repository-edit tools editRepo and editDbtProject (its "workstreams"), so you can decide where a change should go.',
    "Use this before editRepo / editDbtProject when the user asks to change a repo you may have an open pull request on already: read the list, then either pass an existing pull request URL as the edit tool's `prUrl` to continue that one, or set `startNewPullRequest` to open a separate pull request.",
    'Returns each workstream as owner/repo with its pull request URL, number, and a short summary. Optionally filter to a single repository. Read-only.',
].join(' ');

export const toolListWorkstreamsArgsSchema = z.object({
    repoTarget: z
        .string()
        .nullable()
        .describe(
            'Restrict the list to a single repository, as "owner/repo" (e.g. "acme/web-app"). Pass null to list the pull requests this conversation has opened across all repositories.',
        ),
});

export type ToolListWorkstreamsArgs = z.infer<
    typeof toolListWorkstreamsArgsSchema
>;

export const toolListWorkstreamsStructuredContentSchema = z.object({
    repoTarget: z
        .string()
        .nullable()
        .describe(
            'The "owner/repo" the list was restricted to, or null when it spans every repository.',
        ),
    workstreams: z
        .array(
            z.object({
                repository: z
                    .string()
                    .describe(
                        'Repository the pull request was opened on, as "owner/repo".',
                    ),
                prNumber: z.number().int(),
                prUrl: z
                    .string()
                    .describe(
                        "Pull request URL; pass it as the edit tool's `prUrl` to continue this workstream.",
                    ),
                summary: z
                    .string()
                    .nullable()
                    .describe(
                        'Short summary of the changes in the pull request, or null when none was recorded.',
                    ),
            }),
        )
        .describe(
            'Pull requests this conversation has opened; empty when none match.',
        ),
});

export type ToolListWorkstreamsStructuredContent = z.infer<
    typeof toolListWorkstreamsStructuredContentSchema
>;

export const toolListWorkstreamsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListWorkstreamsStructuredContentSchema,
});

export type ToolListWorkstreamsOutput = z.infer<
    typeof toolListWorkstreamsOutputSchema
>;
