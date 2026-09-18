import { z } from 'zod';
import { ChartKind } from '../../../../types/savedCharts';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_GET_DASHBOARD_CHARTS_DESCRIPTION = `Tool: "getDashboardCharts"
Purpose:
Retrieves the list of charts within a specific dashboard, with pagination support.

Usage tips:
- Use this tool after "findContent" to drill into a specific dashboard's charts.
- Requires a dashboardUuid, which you can get from "findContent" results. Also pass the dashboardName for display purposes.
- Results are paginated — use the page parameter to get more results if needed.
- Each chart includes its name, description, type, and view count.`;

export const toolGetDashboardChartsArgsSchema = createToolSchema()
    .extend({
        dashboardUuid: z
            .string()
            .describe(
                'The UUID of the dashboard to get charts for. Obtained from findContent results.',
            ),
        dashboardName: z
            .string()
            .optional()
            .describe(
                'The name of the dashboard (for display purposes). Obtained from findContent results.',
            ),
    })
    .withPagination()
    .build();

export const toolGetDashboardChartsArgsSchemaTransformed =
    toolGetDashboardChartsArgsSchema;

const dashboardChartSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    chartType: z.enum(ChartKind),
    viewsCount: z.number(),
    verification: z
        .object({
            verifiedBy: z
                .string()
                .describe('Full name of the user who verified the chart.'),
            verifiedAt: z
                .string()
                .describe('When the chart was verified, as an ISO 8601 date.'),
        })
        .nullable()
        .describe('Null when the chart is not verified.'),
});

export const toolGetDashboardChartsStructuredContentSchema = z.object({
    dashboardUuid: z.string(),
    dashboardName: z.string(),
    page: z.number().describe('The page of charts returned, starting at 1.'),
    pageSize: z.number(),
    totalPageCount: z.number(),
    totalResults: z
        .number()
        .describe('Total number of charts in the dashboard across all pages.'),
    charts: z
        .array(dashboardChartSchema)
        .describe('Charts on this page, verified charts first.'),
});

export const toolGetDashboardChartsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGetDashboardChartsStructuredContentSchema,
});

export type ToolGetDashboardChartsArgs = z.infer<
    typeof toolGetDashboardChartsArgsSchema
>;
export type ToolGetDashboardChartsArgsTransformed = ToolGetDashboardChartsArgs;
export type ToolGetDashboardChartsStructuredContent = z.infer<
    typeof toolGetDashboardChartsStructuredContentSchema
>;
export type ToolGetDashboardChartsOutput = z.infer<
    typeof toolGetDashboardChartsOutputSchema
>;
