import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION = [
    "Read the unified diff of a GitHub pull request in this project's dbt repository.",
    'Use it when you need to know exactly what a pull request contains rather than relying on your own summary: to answer questions about it, before adding to it, or before folding, splitting or reorganising pull requests.',
    'Pass its URL from listWorkstreams or an earlier edit result.',
].join(' ');

export const toolGetPullRequestDiffArgsSchema = z.object({
    prUrl: z
        .string()
        .describe(
            'Full URL of the pull request to read, e.g. "https://github.com/acme/analytics/pull/42"; it must be in this project\'s dbt repository.',
        ),
});

export type ToolGetPullRequestDiffArgs = z.infer<
    typeof toolGetPullRequestDiffArgsSchema
>;

export const toolGetPullRequestDiffStructuredContentSchema = z.object({
    pullRequest: z
        .string()
        .describe(
            'Short "owner/repo #123" label of the pull request, parsed from its URL.',
        ),
    diff: z
        .string()
        .describe(
            'Unified diff of the pull request, cut at the character cap when `truncated` is true. Empty when the pull request has no file changes.',
        ),
    truncated: z
        .boolean()
        .describe(
            'True when `diff` was cut at the character cap; ask about a specific file to see the rest.',
        ),
    totalChars: z
        .number()
        .int()
        .describe('Length of the full diff in characters, before any cut.'),
});

export type ToolGetPullRequestDiffStructuredContent = z.infer<
    typeof toolGetPullRequestDiffStructuredContentSchema
>;

export const toolGetPullRequestDiffOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGetPullRequestDiffStructuredContentSchema,
});

export type ToolGetPullRequestDiffOutput = z.infer<
    typeof toolGetPullRequestDiffOutputSchema
>;
