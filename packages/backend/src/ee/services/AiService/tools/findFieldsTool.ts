import { DynamicStructuredTool } from '@langchain/core/tools';
import {
    aiFindFieldsToolSchema,
    Explore,
    getItemId,
    type CompiledField,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { intersection, mapValues, pick } from 'lodash';
import { z } from 'zod';
import Logger from '../../../../logging/logger';

type GetFindFieldsToolArgs = {
    getExplore: (args: { exploreName: string }) => Promise<Explore>;
    searchFields?: (args: {
        exploreName: string;
        embeddingSearchQueries: Array<{ name: string; description: string }>;
    }) => Promise<string[]>;
    availableTags: string[] | null;
};

export const getFindFieldsTool = ({
    getExplore,
    searchFields,
    availableTags,
}: GetFindFieldsToolArgs) => {
    const getMinimalTableInformation = async ({
        exploreName,
        tables,
        embeddingSearchQueries,
    }: {
        exploreName: string;
        tables: Explore['tables'];
        embeddingSearchQueries: Array<{ name: string; description: string }>;
    }) => {
        const filteredFields = await searchFields?.({
            exploreName,
            embeddingSearchQueries,
        });

        const filterFieldFn = (field: CompiledField) => {
            if (field.hidden) return false;

            if (
                availableTags &&
                intersection(availableTags, field.tags).length === 0
            ) {
                return false;
            }

            if (!filteredFields) return true;
            return filteredFields.includes(field.name);
        };
        const mapFieldFn = (field: CompiledField) => ({
            fieldId: getItemId(field),
            ...pick(field, ['label', 'description', 'type']),
        });

        const mappedValues = mapValues(tables, (t) => {
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

    return new DynamicStructuredTool({
        name: 'findFieldsInExplore',
        description: `Pick an explore and generate embedded search queries by breaking down user input into questions, ensuring each part of the input is addressed.
Include all relevant information without omitting any names, companies, dates, or other pertinent details.
Assume all potential fields, including company names and personal names, exist in the explore.
It is important to find fields for the filters as well.`,
        schema: aiFindFieldsToolSchema,
        func: async ({
            exploreName,
            embeddingSearchQueries,
        }: z.infer<typeof aiFindFieldsToolSchema>) => {
            try {
                const explore = await getExplore({ exploreName });
                const tables = await getMinimalTableInformation({
                    exploreName: explore.name,
                    tables: explore.tables,
                    embeddingSearchQueries,
                });

                return `Here are the available fields for explore named "${exploreName}":
    - Read field labels and descriptions carefully to understand their usage.
    - Look for hints in the field descriptions on how to/when to use the fields and ask the user for clarification if the field information is ambiguous or incomplete.

\`\`\`json
${JSON.stringify(tables, null, 4)}
\`\`\``;
            } catch (error) {
                Logger.debug({ error });
                Sentry.captureException(error);
                return `Error fetching fields for explore with name "${exploreName}".`;
            }
        },
    });
};
