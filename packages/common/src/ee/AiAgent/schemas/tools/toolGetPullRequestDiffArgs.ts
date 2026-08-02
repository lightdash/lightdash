import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_GET_PULL_REQUEST_DIFF_DESCRIPTION = [
    'Read the actual code diff (unified patch) of a pull request this conversation opened, or that belongs to this project.',
    'Use this before deciding how to split, consolidate, or continue changes across pull requests — for example to see exactly what a pull request already contains before adding to it, before folding one pull request into another, or when the user asks you to reorganise open pull requests.',
    'Pass the pull request URL (from listWorkstreams or a previous editRepo / editDbtProject result). The pull request must belong to this project, or be one this conversation opened. Read-only. GitHub only for now.',
].join(' ');

export const toolGetPullRequestDiffArgsSchema = z.object({
    prUrl: z
        .string()
        .describe(
            'The full URL of the pull request to read, e.g. "https://github.com/acme/web-app/pull/42". Must be a pull request this conversation opened or one that belongs to this project\'s repository.',
        ),
});

export type ToolGetPullRequestDiffArgs = z.infer<
    typeof toolGetPullRequestDiffArgsSchema
>;

export const toolGetPullRequestDiffOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolGetPullRequestDiffOutput = z.infer<
    typeof toolGetPullRequestDiffOutputSchema
>;
