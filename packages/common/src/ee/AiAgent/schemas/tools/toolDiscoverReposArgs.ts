import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_DISCOVER_REPOS_DESCRIPTION = [
    'List the GitHub repositories this Lightdash organization can read through its connected GitHub App installation.',
    'Use this to find a repository to inspect with `exploreRepo` — including repositories other than the dbt project (Lightdash itself, an upstream service, infra, CI config) — instead of asking the user to connect the GitHub MCP.',
    'Returns each repository as owner/repo with its default branch and whether it is private. Read-only.',
].join(' ');

export const toolDiscoverReposArgsSchema = z.object({});

export type ToolDiscoverReposArgs = z.infer<typeof toolDiscoverReposArgsSchema>;

export const toolDiscoverReposStructuredContentSchema = z.object({
    repos: z
        .array(
            z.object({
                owner: z.string(),
                repo: z.string(),
                defaultBranch: z.string(),
                private: z.boolean(),
            }),
        )
        .describe(
            'Repositories readable through the connected GitHub App installation; pass `owner/repo` as the exploreRepo `target`. Empty when none are accessible.',
        ),
});

export type ToolDiscoverReposStructuredContent = z.infer<
    typeof toolDiscoverReposStructuredContentSchema
>;

export const toolDiscoverReposOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolDiscoverReposStructuredContentSchema,
});

export type ToolDiscoverReposOutput = z.infer<
    typeof toolDiscoverReposOutputSchema
>;
