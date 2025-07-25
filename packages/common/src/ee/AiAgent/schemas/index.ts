import { z } from 'zod';
import {
    toolFindExploresArgsSchema,
    toolFindFieldsArgsSchema,
    toolNewFindFieldsArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolVerticalBarArgsSchema,
} from './tools';

export * from './fieldSearchQuery';
export * from './filters';
export * from './tools';
export * from './visualizations';

// TODO: use `discriminatedUnion` after removing old find fields tool
export const AgentToolCallArgsSchema = z.union([
    toolFindFieldsArgsSchema,
    toolNewFindFieldsArgsSchema,
    toolVerticalBarArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolFindExploresArgsSchema,
]);

export type AgentToolCallArgs = z.infer<typeof AgentToolCallArgsSchema>;
