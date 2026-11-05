import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_DISCOVER_REPOS_DESCRIPTION = [
    "List the repositories `exploreRepo` can read: this project's repository and, on GitHub, the ones the user can access through their linked account.",
    'Use it to find a repository other than the dbt project, such as an upstream service, infrastructure or CI configuration, before reading it with `exploreRepo`.',
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
            'Repositories `exploreRepo` can read; pass `owner/repo` as its `target`. Empty when none are accessible.',
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
