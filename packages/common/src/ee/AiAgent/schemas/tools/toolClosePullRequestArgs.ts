import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_CLOSE_PULL_REQUEST_DESCRIPTION = [
    'Close, without merging, a pull request this conversation opened, when the user asks to close, discard or drop it (for example after its change was folded into another pull request).',
    'Pass its URL from listWorkstreams or an earlier edit result. Closing is reversible: the pull request can be reopened on the provider. The user needs source-code write permission on this project.',
].join(' ');

export const toolClosePullRequestArgsSchema = z.object({
    prUrl: z
        .string()
        .describe(
            'Full URL of the pull request to close, e.g. "https://github.com/acme/web-app/pull/42": one this conversation opened, or one in this project\'s dbt repository.',
        ),
});

export type ToolClosePullRequestArgs = z.infer<
    typeof toolClosePullRequestArgsSchema
>;

export const toolClosePullRequestStructuredContentSchema = z.object({
    state: z
        .literal('closed')
        .describe('State of the pull request on the provider after the call.'),
});

export type ToolClosePullRequestStructuredContent = z.infer<
    typeof toolClosePullRequestStructuredContentSchema
>;

export const toolClosePullRequestOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolClosePullRequestStructuredContentSchema,
});

export type ToolClosePullRequestOutput = z.infer<
    typeof toolClosePullRequestOutputSchema
>;
