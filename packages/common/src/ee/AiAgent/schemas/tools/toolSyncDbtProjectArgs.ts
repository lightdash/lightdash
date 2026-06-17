import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_SYNC_DBT_PROJECT_DESCRIPTION = `Tool: syncDbtProject

Purpose:
Recompile/refresh the Lightdash project so that semantic-layer changes that have already landed in the dbt repository (a newly merged metric, dimension, model or rename) become available in explores. This is the same operation as clicking "Settings → Project → Sync dbt project" (the "Refresh dbt" button) in the web app.

Use this AFTER a writeback pull request has been merged, to make the merged change usable inside Lightdash, so you can then build/verify a chart or repoint affected content. Without a sync, a just-merged field will not yet appear in the explores.

When to use:
- A writeback PR you opened has been merged and the new/renamed/removed field is not yet reflected in the explores.
- The user asks to "refresh", "sync", "recompile" or "pull in" the dbt changes.

When NOT to use:
- To make a change to the semantic layer — use editDbtProject (this tool does not edit anything, it only refreshes).
- Before a change has actually merged — there is nothing new to pick up.

Behaviour:
This triggers a compile job and waits for it to finish (up to a timeout). It returns:
- "success" once the compile completes — the new/changed fields are now live and you can immediately build or verify content.
- "in_progress" if the compile is still running when the wait times out — tell the user it's still syncing and to retry shortly.
- "error" if the compile failed — surface the failure summary.

Parameters:
- reason: An optional short, human-readable note about why you're syncing (e.g. "picking up the newly merged net_revenue metric"). For your own logging/telemetry; it does not affect the compile.
`;

export const toolSyncDbtProjectArgsSchema = createToolSchema()
    .extend({
        reason: z
            .string()
            .nullable()
            .describe(
                'An optional short note about why the project is being synced (e.g. "picking up the newly merged net_revenue metric"). Informational only; does not affect the compile. Pass null if you have nothing to add.',
            ),
    })
    .build();

export const toolSyncDbtProjectOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolSyncDbtProjectArgs = z.infer<
    typeof toolSyncDbtProjectArgsSchema
>;
export type ToolSyncDbtProjectArgsTransformed = ToolSyncDbtProjectArgs;
export type ToolSyncDbtProjectOutput = z.infer<
    typeof toolSyncDbtProjectOutputSchema
>;
