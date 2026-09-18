import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_CLOSE_PULL_REQUEST_DESCRIPTION = [
    'Close (without merging) a pull request this conversation opened with editRepo or editDbtProject.',
    'Use this when the user asks to discard, abandon, or close one of the open pull requests — for example after folding its change into another pull request, or when a change is no longer wanted.',
    'Pass the pull request URL (from listWorkstreams or a previous editRepo / editDbtProject result). Closing is reversible — the pull request can be reopened on the provider. Only works on a pull request that belongs to this project, and the user must have source-code write permission. GitHub only for now.',
].join(' ');

export const toolClosePullRequestArgsSchema = z.object({
    prUrl: z
        .string()
        .describe(
            'The full URL of the pull request to close, e.g. "https://github.com/acme/web-app/pull/42". Must be a pull request opened on this project\'s repository.',
        ),
});

export type ToolClosePullRequestArgs = z.infer<
    typeof toolClosePullRequestArgsSchema
>;

export const toolClosePullRequestStructuredContentSchema = z.object({
    prUrl: z.string().describe('URL of the pull request that was closed.'),
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
