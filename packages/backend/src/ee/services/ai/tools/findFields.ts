import {
    Explore,
    getItemId,
    toolFindFieldsArgsSchema,
    type CompiledField,
} from '@lightdash/common';
import { tool } from 'ai';
import { mapValues, pick } from 'lodash';
import type { GetExploreFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getExplore: GetExploreFn;
};

export const getFindFields = ({ getExplore }: Dependencies) => {
    const schema = toolFindFieldsArgsSchema;

    const getMinimalTableInformation = async ({
        explore,
    }: {
        explore: Explore;
    }) => {
        const filterFieldFn = (field: CompiledField) => !field.hidden;

        const mapFieldFn = (field: CompiledField) => ({
            fieldId: getItemId(field),
            ...pick(field, ['label', 'description', 'type']),
            ...(field.aiHint ? { aiHint: field.aiHint } : {}),
        });

        const mappedValues = mapValues(explore.tables, (t) => {
            const dimensions = Object.values(t.dimensions);
            const metrics = Object.values(t.metrics);

            return {
                ...pick(t, ['name', 'label', 'description']),
                dimensions: dimensions.filter(filterFieldFn).map(mapFieldFn),
                metrics: metrics.filter(filterFieldFn).map(mapFieldFn),
                ...(t.aiHint ? { aiHint: t.aiHint } : {}),
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
                const tables = await getMinimalTableInformation({ explore });

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
