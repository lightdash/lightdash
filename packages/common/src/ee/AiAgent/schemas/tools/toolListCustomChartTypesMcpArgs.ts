import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import { mcpCustomChartTypeOutputSchema } from './toolFindCustomChartTypesMcpArgs';

export const MCP_TOOL_LIST_CUSTOM_CHART_TYPES_DESCRIPTION = `Tool: list_custom_chart_types

Browse the project's custom chart types (including ones installed from the library), newest first, one page at a time. Page starts at 1.

- Each item has the same fields as find_custom_chart_types: latest version, field slots, config options and a Chart Studio link.
- Use find_custom_chart_types to search by text or fetch one by slug.
`;

export const mcpListCustomChartTypesArgsSchema = createToolSchema()
    .withPagination()
    .build();

export type McpListCustomChartTypesArgs = z.infer<
    typeof mcpListCustomChartTypesArgsSchema
>;

export const mcpCustomChartTypesPaginationSchema = z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalResults: z.number().int(),
    totalPageCount: z.number().int(),
});

export const mcpListCustomChartTypesOutputSchema = z.object({
    pagination: mcpCustomChartTypesPaginationSchema,
    results: z
        .array(mcpCustomChartTypeOutputSchema)
        .describe('Chart types on this page, newest first.'),
});

export type McpListCustomChartTypesOutput = z.infer<
    typeof mcpListCustomChartTypesOutputSchema
>;
