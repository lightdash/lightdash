import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { composerBuiltinChartVizConfigSchemaV1 } from './composerChartVizConfigSchema';

export const TOOL_VISUALIZE_DESCRIPTION = `Visualize a node's result for the user as a chart or table. Each call adds one card to the thread; a result stays hidden until it is visualized.

nodeId names a node from a successful query call in this thread, in this turn or an earlier one, so a result can be visualized again with a different vizConfig without rerunning query. vizConfig references are that node's result columns, as listed in its query result.

Pie and series-split charts return readability notes when they have many slices or series.`;

const toolVisualizeArgsSchemaV1 = createToolSchema()
    .extend({
        nodeId: z.string().describe('The node to visualize, by node id.'),
        title: z
            .string()
            .describe(
                'Card title a reader understands without seeing the query, e.g. "Revenue by month".',
            ),
        description: z
            .string()
            .nullable()
            .describe(
                'One sentence on what the card shows, only when the title is not enough. Null otherwise.',
            ),
        vizConfig: composerBuiltinChartVizConfigSchemaV1,
    })
    .build();

export const toolVisualizeArgsSchema = toolVisualizeArgsSchemaV1;

// Wide persisted contract, evolved like toolRunQueryArgsSchemaPersisted; a
// vizConfig restructure also bumps the composer artifact schemaVersion.
export const toolVisualizeArgsSchemaPersisted = toolVisualizeArgsSchemaV1;

export type ToolVisualizeArgs = z.infer<typeof toolVisualizeArgsSchema>;

const toolVisualizeSuccessMetadataSchema = z.object({
    status: z.literal('success'),
    nodeId: z.string(),
    artifactUuid: z.string(),
    versionUuid: z.string(),
});

export const toolVisualizeOutputSchema = structuredToolOutputSchema({
    metadata: z.discriminatedUnion('status', [
        toolVisualizeSuccessMetadataSchema,
        z.object({ status: z.literal('error') }),
    ]),
    structuredContent: z.object({
        nodeId: z.string().describe('The node visualized.'),
        hints: z
            .array(z.string())
            .describe('Readability notes on the chart; empty when none.'),
    }),
});

export type ToolVisualizeOutput = z.infer<typeof toolVisualizeOutputSchema>;
