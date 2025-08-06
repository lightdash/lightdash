import { z } from 'zod';

export const toolFindDashboardsArgsSchema = z.object({
    type: z.literal('find_dashboards'),
    dashboardSearchQueries: z.array(
        z.object({
            label: z
                .string()
                .describe('Dashboard name or description to search for'),
        }),
    ),
    page: z
        .number()
        .positive()
        .nullable()
        .describe('Use this to paginate through the results'),
});

export type ToolFindDashboardsArgs = z.infer<
    typeof toolFindDashboardsArgsSchema
>;

export const toolFindDashboardsArgsSchemaTransformed =
    toolFindDashboardsArgsSchema;

export type ToolFindDashboardsArgsTransformed = ToolFindDashboardsArgs;
