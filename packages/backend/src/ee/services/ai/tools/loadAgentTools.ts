import { tool } from 'ai';
import { z } from 'zod';
import { toModelOutput } from '../utils/toModelOutput';

export const getLoadAgentTools = (
    onLoad: () => void = () => {},
    deferredInstructions = '',
) =>
    tool({
        description:
            "Load the rest of this agent's tools for this turn. Call it only when the request needs a capability your current tools lack, and before telling the user that a capability is unavailable.",
        inputSchema: z.object({}),
        execute: async () => {
            onLoad();
            return {
                result: [
                    'The remaining agent tools are now loaded.',
                    deferredInstructions,
                ]
                    .filter(Boolean)
                    .join('\n\n'),
                metadata: { status: 'success' as const },
            };
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
