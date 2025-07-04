import {
    Explore,
    getItemId,
    toolFindFieldsArgsSchema,
    type CompiledField,
} from '@lightdash/common';
import { tool } from 'ai';
import { mapValues, pick } from 'lodash';
import type {
    GetExploreFn,
    SearchFieldsFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplore: GetExploreFn;
    searchFields?: SearchFieldsFn;
};

export const getFindFields = ({ getExplore, searchFields }: Dependencies) => {
    const schema = toolFindFieldsArgsSchema;

    const getMinimalTableInformation = async ({
        explore,
        embeddingSearchQueries,
    }: {
        explore: Explore;
        embeddingSearchQueries: Array<{ name: string; description: string }>;
    }) => {
        // TODO: revisit this once we enable embedding search
        // first we should filter and then we should do the embedding search
        const filteredFields = await searchFields?.({
            exploreName: explore.name,
            embeddingSearchQueries,
        });

        const filterFieldFn = (field: CompiledField) => {
            if (field.hidden) return false;

            if (!filteredFields) return true;
            return filteredFields.includes(field.name);
        };
        const mapFieldFn = (field: CompiledField) => ({
            fieldId: getItemId(field),
            ...pick(field, ['label', 'description', 'type']),
        });

        const mappedValues = mapValues(explore.tables, (t) => {
            const dimensions = Object.values(t.dimensions);
            const metrics = Object.values(t.metrics);

            return {
                ...pick(t, ['name', 'label', 'description']),
                dimensions: dimensions.filter(filterFieldFn).map(mapFieldFn),
                metrics: metrics.filter(filterFieldFn).map(mapFieldFn),
            };
        });

        return mappedValues;
    };

    return tool({
        description: `Use this tool to find the Fields (Metrics and Dimensions) most relevant to the user's request, once you have information about the available Explores. If the available fields aren't suitable, you can retry the tool with another available Explore.`,
        parameters: schema,
        execute: async ({ exploreName }) => {
            try {
                const explore = await getExplore({ exploreName });
                const tables = await getMinimalTableInformation({
                    explore,
                    // TODO: we should implement hybrid search for this tool
                    // and LLM should fill in the schema with possible search queries
                    // embeddingSearchQueries,
                    embeddingSearchQueries: [],
                });

                return `Here are the available Fields (Metrics and Dimensions) for explore named "${exploreName}":

${serializeData(tables, 'json')}`;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    `Error finding fields for explore "${exploreName}".`,
                );
            }
        },
    });
};
