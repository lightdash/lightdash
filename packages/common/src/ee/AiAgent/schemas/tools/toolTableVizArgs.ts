import { z } from 'zod';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { tableVizConfigSchema } from '../visualizations';

export const TOOL_TABLE_VIZ_DESCRIPTION = `Use this tool to query data to display in a table or summarized if limit is set to 1.`;

export const toolTableVizArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        vizConfig: tableVizConfigSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
    })
    .build();

export type ToolTableVizArgs = z.infer<typeof toolTableVizArgsSchema>;

export const toolTableVizArgsSchemaTransformed = toolTableVizArgsSchema
    .extend({
        // backwards compatibility for old viz configs without customMetrics
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        filters: filtersSchemaTransformed,
    })
    .transform((data) => ({
        ...data,
        customMetrics: customMetricsSchemaTransformed.parse(data.customMetrics),
    }));

export type ToolTableVizArgsTransformed = z.infer<
    typeof toolTableVizArgsSchemaTransformed
>;

export const toolTableVizOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolTableVizOutput = z.infer<typeof toolTableVizOutputSchema>;
