import { z } from 'zod';

export const toolFindChartsArgsSchema = z.object({
    type: z.literal('find_charts'),
    chartSearchQueries: z.array(
        z.object({
            label: z
                .string()
                .describe('Chart name or description to search for'),
        }),
    ),
    page: z
        .number()
        .positive()
        .nullable()
        .describe('Use this to paginate through the results'),
});

export type ToolFindChartsArgs = z.infer<typeof toolFindChartsArgsSchema>;

export const toolFindChartsArgsSchemaTransformed = toolFindChartsArgsSchema;

export type ToolFindChartsArgsTransformed = ToolFindChartsArgs;
