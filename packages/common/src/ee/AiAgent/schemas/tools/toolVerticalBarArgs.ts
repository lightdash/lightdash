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
import { verticalBarMetricVizConfigSchema } from '../visualizations';

export const TOOL_VERTICAL_BAR_VIZ_DESCRIPTION = `Use this tool to generate a Bar Chart Visualization.`;

export const toolVerticalBarArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        vizConfig: verticalBarMetricVizConfigSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
    })
    .build();

export type ToolVerticalBarArgs = z.infer<typeof toolVerticalBarArgsSchema>;

export const toolVerticalBarArgsSchemaTransformed = toolVerticalBarArgsSchema
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

export type ToolVerticalBarArgsTransformed = z.infer<
    typeof toolVerticalBarArgsSchemaTransformed
>;

export const toolVerticalBarOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolVerticalBarOutput = z.infer<typeof toolVerticalBarOutputSchema>;
