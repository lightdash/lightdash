import { z } from 'zod';

import { toolFindExploresArgsSchema } from './tools/toolFindExploresArgs';
import { toolFindFieldsArgsSchema } from './tools/toolFindFieldsArgs';
import { toolTableVizArgsSchema } from './tools/toolTableVizArgs';
import { toolTimeSeriesArgsSchema } from './tools/toolTimeSeriesArgs';
import { toolVerticalBarArgsSchema } from './tools/toolVerticalBarArgs';

export * from './filters';
export * from './tools';
export * from './visualizations';

export const AgentToolCallArgsSchema = z.discriminatedUnion('type', [
    toolFindFieldsArgsSchema,
    toolVerticalBarArgsSchema,
    toolTableVizArgsSchema,
    toolTimeSeriesArgsSchema,
    toolFindExploresArgsSchema,
]);

export type AgentToolCallArgs = z.infer<typeof AgentToolCallArgsSchema>;
