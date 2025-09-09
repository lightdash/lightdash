import {
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesArgsSchemaTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { AiToolDependencies } from '../types/aiTools';
import { applyCompatLayer } from '../utils/applyCompatibilityLayer';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = AiToolDependencies<{
    searchFieldValues: SearchFieldValuesFn;
}>;

export const getSearchFieldValues = ({
    searchFieldValues,
    schemaCompatLayers,
}: Dependencies) =>
    tool({
        description: toolSearchFieldValuesArgsSchema.description,
        inputSchema: applyCompatLayer(
            schemaCompatLayers,
            toolSearchFieldValuesArgsSchema,
        ),
        execute: async (toolArgs) => {
            try {
                const args =
                    toolSearchFieldValuesArgsSchemaTransformed.parse(toolArgs);

                const results = await searchFieldValues(args);

                return serializeData(results, 'json');
            } catch (e) {
                return toolErrorHandler(e, 'Error searching field values.');
            }
        },
    });
