import {
    SchemaCompatibilityManager,
    toolSearchFieldValuesArgsSchema,
    toolSearchFieldValuesArgsSchemaTransformed,
    type SchemaTarget,
} from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
    modelTarget: SchemaTarget;
};

export const getSearchFieldValues = ({
    searchFieldValues,
    modelTarget,
}: Dependencies) => {
    const schema = SchemaCompatibilityManager.transformSchema(
        toolSearchFieldValuesArgsSchema,
        modelTarget,
    );

    return tool({
        description: toolSearchFieldValuesArgsSchema.description,
        parameters: schema,
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
};
