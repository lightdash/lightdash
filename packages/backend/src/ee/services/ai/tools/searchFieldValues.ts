import {
    searchFieldValuesToolDefinition,
    toolSearchFieldValuesArgsSchemaTransformed,
} from '@lightdash/common';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
};

const toolDefinition = searchFieldValuesToolDefinition.for('ai-sdk');

export const getSearchFieldValues = ({ searchFieldValues }: Dependencies) =>
    toolDefinition.build({
        execute: async (toolArgs) => {
            try {
                const args =
                    toolSearchFieldValuesArgsSchemaTransformed.parse(toolArgs);

                const results = await searchFieldValues(args);

                return {
                    status: 'success',
                    type: 'json',
                    result: {
                        values: results,
                    },
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    status: 'error',
                    error: toolErrorHandler(e, 'Error searching field values.'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
    });
