import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LIST_WORKSTREAMS_DESCRIPTION = [
    'List the pull requests this conversation has already opened with editRepo (its "workstreams"), so you can decide where a change should go.',
    'Use this before editRepo when the user asks to change a repo you may have an open pull request on already: read the list, then either pass an existing pull request URL as editRepo `prUrl` to continue that one, or set editRepo `startNewPullRequest` to open a separate pull request.',
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

export const toolListWorkstreamsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolListWorkstreamsOutput = z.infer<
    typeof toolListWorkstreamsOutputSchema
>;
