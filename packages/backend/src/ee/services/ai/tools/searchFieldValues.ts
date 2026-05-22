import { ToolDefinitions } from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
};

const agentTools = ToolDefinitions.for('agent');

export const getSearchFieldValues = ({ searchFieldValues }: Dependencies) =>
    tool({
        description: agentTools.searchFieldValues.description,
        inputSchema: agentTools.searchFieldValues.inputSchema,
        outputSchema: agentTools.searchFieldValues.outputSchema,
        execute: async (toolArgs) => {
            try {
                const args = agentTools.searchFieldValues.parseInput(toolArgs);

                const results = await searchFieldValues(args);

                return {
                    result: serializeData(results, 'json'),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error searching field values.',
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
