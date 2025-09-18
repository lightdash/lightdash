import { z } from 'zod';
import {
    toolDashboardArgsSchema,
    toolFindChartsArgsSchema,
    toolFindDashboardsArgsSchema,
    toolFindExploresArgsSchema,
    toolFindFieldsArgsSchema,
    toolImproveContextArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolVerticalBarArgsSchema,
} from './tools';

export * from './customMetrics';
export * from './filters';
export * from './sortField';
export * from './tools';
export * from './visualizations';

export const AgentToolCallArgsSchema = z.discriminatedUnion('type', [
    toolDashboardArgsSchema,
    toolFindChartsArgsSchema,
    toolFindDashboardsArgsSchema,
    toolFindFieldsArgsSchema,
    toolImproveContextArgsSchema,
    toolVerticalBarArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolFindExploresArgsSchema,
]);

export type AgentToolCallArgs = z.infer<typeof AgentToolCallArgsSchema>;
