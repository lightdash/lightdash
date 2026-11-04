import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LIST_WORKSTREAMS_DESCRIPTION = [
    'List the pull requests this conversation opened with the repository edit tools, each with its URL and a short summary.',
    'Call it before an edit when you are unsure whether the change belongs to a pull request that is already open.',
].join(' ');

export const toolListWorkstreamsArgsSchema = z.object({
    repoTarget: z
        .string()
        .nullable()
        .describe(
            'One repository to list, as "owner/repo" (e.g. "acme/web-app"); null lists every repository.',
        ),
});

export type ToolListWorkstreamsArgs = z.infer<
    typeof toolListWorkstreamsArgsSchema
>;

const workstreamSchema = z.object({
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
});

export const toolListWorkstreamsStructuredContentSchema = z.union([
    z.object({
        repoTarget: z
            .string()
            .nullable()
            .describe(
                'The "owner/repo" the list was restricted to, or null when it spans every repository.',
            ),
        workstreams: z
            .array(workstreamSchema)
            .length(0)
            .describe(
                'Pull requests this conversation has opened; empty when none match.',
            ),
    }),
    z.object({
        workstreams: z
            .array(workstreamSchema)
            .nonempty()
            .describe(
                'Pull requests this conversation has opened; empty when none match.',
            ),
    }),
]);

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
