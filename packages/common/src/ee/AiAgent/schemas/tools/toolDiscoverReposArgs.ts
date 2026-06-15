import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_DISCOVER_REPOS_DESCRIPTION = [
    'List the GitHub repositories this Lightdash organization can read through its connected GitHub App installation.',
    'Use this to find a repository to inspect with `exploreRepo` — including repositories other than the dbt project (Lightdash itself, an upstream service, infra, CI config) — instead of asking the user to connect the GitHub MCP.',
    'Returns each repository as owner/repo with its default branch and whether it is private. Read-only.',
].join(' ');

export const toolDiscoverReposArgsSchema = z.object({});

export type ToolDiscoverReposArgs = z.infer<typeof toolDiscoverReposArgsSchema>;

export const toolDiscoverReposOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolDiscoverReposOutput = z.infer<
    typeof toolDiscoverReposOutputSchema
>;
