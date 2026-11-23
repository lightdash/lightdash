import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_READ_DESCRIPTION = `Read this project's dbt repository with a short JavaScript script run in a sandbox. It reads the branch of this conversation's pull request when there is one, so it sees the changes you saved; otherwise it reads what is published.

Use it to read the files you are about to change or just changed, several in one call. What the script passes to console.log is what you get back, so print only what you need.

API (synchronous, values are plain JSON, paths relative to the dbt project): repo.list(prefix?) -> file paths; repo.read(path) -> the file's text, or null; yaml.get(path, keys) -> the value at keys, e.g. yaml.get(m.yml, [...m.keys, 'columns']); dbt.model(name) -> { yml, sql, keys } | null, where yml and sql are file PATHS, so read them with repo.read. It cannot change files: save a change with editDbtProject.`;

export const toolReadArgsSchema = createToolSchema()
    .extend({
        script: z
            .string()
            .min(1)
            .describe(
                "JavaScript that reads files and prints what you need, e.g. const m = dbt.model('orders'); console.log(repo.read(m.sql));",
            ),
    })
    .build();

export type ToolReadArgs = z.infer<typeof toolReadArgsSchema>;

export const toolReadStructuredContentSchema = z.object({
    branch: z.string().describe('The branch the script read.'),
    onPullRequest: z
        .boolean()
        .describe(
            "Whether that branch is this conversation's pull request rather than what is published.",
        ),
});

export type ToolReadStructuredContent = z.infer<
    typeof toolReadStructuredContentSchema
>;

export const toolReadOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolReadStructuredContentSchema,
});

export type ToolReadOutput = z.infer<typeof toolReadOutputSchema>;
