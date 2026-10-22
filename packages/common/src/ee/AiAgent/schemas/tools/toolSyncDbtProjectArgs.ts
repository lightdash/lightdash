import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_SYNC_DBT_PROJECT_DESCRIPTION = [
    'Recompile the Lightdash project so semantic-layer changes already merged into the dbt repository (a new metric, dimension or model, a rename) appear in the explores: the same as Settings → Project → Sync dbt project. It edits nothing; changes go through editDbtProject.',
    'Merging a writeback pull request from its card in the thread already recompiles the project, so call this when the user asks to sync or refresh, or when a merged field is still missing from the explores (merged elsewhere, or the recompile is still running).',
    'It waits for the compile, up to a timeout.',
].join(' ');

export const toolSyncDbtProjectArgsSchema = createToolSchema()
    .extend({
        reason: z
            .string()
            .nullable()
            .describe(
                'A short note on why you are syncing (e.g. "picking up the newly merged net_revenue metric"), for logs only; null when there is nothing to add.',
            ),
    })
    .build();

export const toolSyncDbtProjectStructuredContentSchema = z.object({
    status: z
        .enum(['success', 'in_progress'])
        .describe(
            '"success" once the compile finished and the new fields are live; "in_progress" when the compile was still running at the wait timeout, so retry shortly.',
        ),
    jobUuid: z.string().describe('UUID of the compile job that was triggered.'),
    message: z.string().describe('Human-readable outcome of the sync.'),
});

export const toolSyncDbtProjectOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolSyncDbtProjectStructuredContentSchema,
});

export type ToolSyncDbtProjectArgs = z.infer<
    typeof toolSyncDbtProjectArgsSchema
>;
export type ToolSyncDbtProjectArgsTransformed = ToolSyncDbtProjectArgs;
export type ToolSyncDbtProjectStructuredContent = z.infer<
    typeof toolSyncDbtProjectStructuredContentSchema
>;
export type ToolSyncDbtProjectOutput = z.infer<
    typeof toolSyncDbtProjectOutputSchema
>;
