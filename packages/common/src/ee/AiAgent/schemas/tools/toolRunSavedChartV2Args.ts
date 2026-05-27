import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const TOOL_RUN_SAVED_CHART_V2_DESCRIPTION = `
Run an existing saved chart by its slug and return the rows it produces.

When to use this tool:
- You created/edited/discovered a relevant chart and want to read
  its results
- If the chart is on a dashboard and dashboard filters should apply, pass the
  dashboard slug too.
`;

export const toolRunSavedChartV2ArgsSchema = createToolSchema({
    description: TOOL_RUN_SAVED_CHART_V2_DESCRIPTION,
})
    .extend({
        chartSlug: z.string().describe('Slug of the saved chart to execute.'),
        dashboardSlug: z
            .string()
            .nullable()
            .describe(
                'Optional slug of the dashboard containing this chart, or null if no dashboard context should be applied.',
            ),
        limit: z
            .number()
            .nullable()
            .describe(
                'Maximum number of rows to return, or null to use the saved chart limit.',
            ),
    })
    .build();

export type ToolRunSavedChartV2Args = z.infer<
    typeof toolRunSavedChartV2ArgsSchema
>;

export const toolRunSavedChartV2OutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunSavedChartV2Output = z.infer<
    typeof toolRunSavedChartV2OutputSchema
>;
