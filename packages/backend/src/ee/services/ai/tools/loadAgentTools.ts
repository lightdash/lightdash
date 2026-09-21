import { tool } from 'ai';
import { z } from 'zod';
import { toModelOutput } from '../utils/toModelOutput';

export const getLoadAgentTools = (onLoad: () => void = () => {}) =>
    tool({
        description:
            'Load the remaining tools available to this agent for this turn. Call this when the request requires a capability absent from the current toolbox, or when the available evidence is insufficient and you need broader context and reasoning. If runQuery is already available and the user did not ask for a visualization, use runQuery; do not load tools merely to create an unsolicited chart. Do not claim a capability is unavailable merely because its tool has not been loaded. Loading does not execute or authorize an action; existing permissions still apply.',
        inputSchema: z.object({}),
        execute: async () => {
            onLoad();
            return {
                result: 'The remaining available agent tools are now loaded. Inspect missing reference context through the available tools. Use their actual schemas; all existing access and action requirements still apply.',
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
