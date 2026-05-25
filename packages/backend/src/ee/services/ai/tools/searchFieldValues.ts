import { searchFieldValuesTool } from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
};

export const getSearchFieldValues = ({ searchFieldValues }: Dependencies) =>
    tool({
        ...searchFieldValuesTool.for('agent'),
        execute: async (toolArgs) => {
            try {
                const args =
                    searchFieldValuesTool.inputSchemaTransformed.parse(
                        toolArgs,
                    );

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
