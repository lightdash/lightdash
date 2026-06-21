import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_CLOSE_PULL_REQUEST_DESCRIPTION = [
    'Close (without merging) a pull request this conversation opened with editRepo.',
    'Use this when the user asks to discard, abandon, or close one of the open pull requests — for example after folding its change into another pull request, or when a change is no longer wanted.',
    'Pass the pull request URL (from listWorkstreams or a previous editRepo result). Closing is reversible — the pull request can be reopened on the provider. Only works on a pull request that belongs to this project, and the user must have source-code write permission. GitHub only for now.',
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

export const toolClosePullRequestOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolClosePullRequestOutput = z.infer<
    typeof toolClosePullRequestOutputSchema
>;
