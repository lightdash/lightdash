import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_VERIFY_DBT_CHANGE_DESCRIPTION = `Check a change you saved with editDbtProject, in the same turn. check "compile" waits for your latest save to reach the pull request branch, then for the branch's dbt compile, up to a minute, and returns whether it compiled and which models failed to load.

Call it after a save that adds a model or changes SQL, before you tell the person the change works; a change to YAML alone is already checked when it is saved. When it fails, fix it with editDbtProject and check again. When it is still running after a minute, say so: a failure is sent to you once it finishes.`;

export const toolVerifyDbtChangeArgsSchema = createToolSchema()
    .extend({
        check: z
            .enum(['compile'])
            .describe(
                'What to check. compile: the pull request branch compiles with dbt and its models load.',
            ),
    })
    .build();

export type ToolVerifyDbtChangeArgs = z.infer<
    typeof toolVerifyDbtChangeArgsSchema
>;

export const toolVerifyDbtChangeStructuredContentSchema = z.object({
    status: z
        .enum([
            'ready',
            'failed',
            'saving',
            'compiling',
            'nothing_saved',
            'unavailable',
        ])
        .describe(
            'ready: the branch compiled. failed: the compile failed. saving or compiling: still running after the wait. nothing_saved: this conversation has no saved change to check. unavailable: the project does not save changes to a pull request.',
        ),
    modelErrorCount: z
        .number()
        .int()
        .describe('Models that compiled but failed to load, when ready.'),
});

export type ToolVerifyDbtChangeStructuredContent = z.infer<
    typeof toolVerifyDbtChangeStructuredContentSchema
>;

export const toolVerifyDbtChangeOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolVerifyDbtChangeStructuredContentSchema,
});

export type ToolVerifyDbtChangeOutput = z.infer<
    typeof toolVerifyDbtChangeOutputSchema
>;
