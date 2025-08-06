import { z } from 'zod';
import {
    toolFindDashboardsArgsSchema,
    toolFindExploresArgsSchema,
    toolFindFieldsArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolVerticalBarArgsSchema,
} from './tools';

export * from './filters';
export * from './tools';
export * from './visualizations';

export const AgentToolCallArgsSchema = z.discriminatedUnion('type', [
    toolFindDashboardsArgsSchema,
    toolFindFieldsArgsSchema,
    toolVerticalBarArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolFindExploresArgsSchema,
]);

export type AgentToolCallArgs = z.infer<typeof AgentToolCallArgsSchema>;
