import {
    Explore,
    aiFindFieldsToolSchema,
    getItemId,
    type CompiledField,
} from '@lightdash/common';
import { tool } from 'ai';
import { mapValues, pick } from 'lodash';
import type {
    GetExploreFn,
    SearchFieldsFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplore: GetExploreFn;
    searchFields?: SearchFieldsFn;
};

export const getFindFields = ({ getExplore, searchFields }: Dependencies) => {
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
        description: `Pick an explore and generate embedded search queries by breaking down user input into questions, ensuring each part of the input is addressed.
Include all relevant information without omitting any names, companies, dates, or other pertinent details.
Assume all potential fields, including company names and personal names, exist in the explore.
It is important to find fields for the filters as well.`,
        parameters: aiFindFieldsToolSchema,
        execute: async ({ exploreName, embeddingSearchQueries }) => {
            try {
                const explore = await getExplore({ exploreName });
                const tables = await getMinimalTableInformation({
                    explore,
                    embeddingSearchQueries,
                });

                return `Here are the available fields for explore named "${exploreName}":
    - Read field labels and descriptions carefully to understand their usage.
    - Look for hints in the field descriptions on how to/when to use the fields and ask the user for clarification if the field information is ambiguous or incomplete.

\`\`\`json
${JSON.stringify(tables, null, 4)}
\`\`\``;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    `Error finding fields for explore "${exploreName}".`,
                );
            }
        },
    });
};
