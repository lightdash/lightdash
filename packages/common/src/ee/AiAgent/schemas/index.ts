import { z } from 'zod';
import {
    toolDashboardArgsSchema,
    type ToolDashboardOutput,
    toolFindChartsArgsSchema,
    type ToolFindChartsOutput,
    toolFindDashboardsArgsSchema,
    type ToolFindDashboardsOutput,
    toolFindExploresArgsSchema,
    type ToolFindExploresOutput,
    toolFindFieldsArgsSchema,
    type ToolFindFieldsOutput,
    toolImproveContextArgsSchema,
    type ToolImproveContextOutput,
    toolProposeChangeArgsSchema,
    type ToolProposeChangeOutput,
    toolSearchFieldValuesArgsSchema,
    type ToolSearchFieldValuesOutput,
    toolTableVizArgsSchema,
    type ToolTableVizOutput,
    toolTimeSeriesArgsSchema,
    type ToolTimeSeriesOutput,
    toolVerticalBarArgsSchema,
    type ToolVerticalBarOutput,
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

export type AgentToolOutput =
    | ToolDashboardOutput
    | ToolFindChartsOutput
    | ToolFindDashboardsOutput
    | ToolFindExploresOutput
    | ToolFindFieldsOutput
    | ToolImproveContextOutput
    | ToolProposeChangeOutput
    | ToolSearchFieldValuesOutput
    | ToolTableVizOutput
    | ToolTimeSeriesOutput
    | ToolVerticalBarOutput;
