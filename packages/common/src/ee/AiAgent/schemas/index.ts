import { z } from 'zod';
import {
    toolDashboardArgsSchema,
    toolFindChartsArgsSchema,
    toolFindDashboardsArgsSchema,
    toolFindExploresArgsSchema,
    toolFindFieldsArgsSchema,
    toolImproveContextArgsSchema,
    toolProposeChangeArgsSchema,
    toolSearchFieldValuesArgsSchema,
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
    toolProposeChangeArgsSchema,
    toolSearchFieldValuesArgsSchema,
    toolVerticalBarArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolFindExploresArgsSchema,
]);

export type AgentToolCallArgs = z.infer<typeof AgentToolCallArgsSchema>;
