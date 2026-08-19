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
import { timeSeriesMetricVizConfigSchema } from '../visualizations/timeSeriesViz';

export const TOOL_TIME_SERIES_VIZ_DESCRIPTION = `Use this tool to generate a Time Series Chart.`;

export const toolTimeSeriesArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        vizConfig: timeSeriesMetricVizConfigSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
    })
    .build();

export type ToolTimeSeriesArgs = z.infer<typeof toolTimeSeriesArgsSchema>;

export const toolTimeSeriesArgsSchemaTransformed = toolTimeSeriesArgsSchema
    .extend({
        // backwards compatibility for old viz configs
        vizConfig: timeSeriesMetricVizConfigSchema.extend({
            xAxisLabel: z.string().default(''),
            yAxisLabel: z.string().default(''),
        }),
        // backwards compatibility for old viz configs without customMetrics
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        filters: filtersSchemaTransformed,
    })
    .transform((data) => ({
        ...data,
        customMetrics: customMetricsSchemaTransformed.parse(data.customMetrics),
    }));

export type ToolTimeSeriesArgsTransformed = z.infer<
    typeof toolTimeSeriesArgsSchemaTransformed
>;

export const toolTimeSeriesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolTimeSeriesOutput = z.infer<typeof toolTimeSeriesOutputSchema>;
