import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_LOAD_AGENT_TOOLS_DESCRIPTION =
    'Load the remaining tools available to this agent for this turn. Call this only when the request requires a capability absent from the current toolbox. If runQuery is already available and the user did not ask for a visualization, use runQuery; do not load tools merely to create an unsolicited chart. Do not claim a capability is unavailable merely because its tool has not been loaded. Loading does not execute or authorize an action; existing permissions still apply.';

export const toolLoadAgentToolsArgsSchema = z.object({});

export const toolLoadAgentToolsStructuredContentSchema = z.object({
    toolsLoaded: z
        .literal(true)
        .describe('The remaining available agent tools are now loaded.'),
    deferredInstructions: z
        .string()
        .nullable()
        .describe(
            'The exact deferred instructions appended to the text, or null when none were appended.',
        ),
});

export const toolLoadAgentToolsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolLoadAgentToolsStructuredContentSchema,
});

export type ToolLoadAgentToolsArgs = z.infer<
    typeof toolLoadAgentToolsArgsSchema
>;
export type ToolLoadAgentToolsStructuredContent = z.infer<
    typeof toolLoadAgentToolsStructuredContentSchema
>;
export type ToolLoadAgentToolsOutput = z.infer<
    typeof toolLoadAgentToolsOutputSchema
>;
