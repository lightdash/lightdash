import {
    CatalogField,
    CompiledDimension,
    CompiledMetric,
    convertToAiHints,
    getItemId,
    isEmojiIcon,
    toolFindFieldsArgsSchema,
    toolNewFindFieldsArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindFieldFn, GetExploreFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findFields: FindFieldFn;
    getExplore: GetExploreFn;
};

const getFieldText = ({
    catalogField,
    exploreField,
}: {
    catalogField: CatalogField;
    exploreField: CompiledDimension | CompiledMetric;
}) => {
    const aiHints = convertToAiHints(exploreField.aiHint);

    return `
    <Field fieldId="${getItemId(exploreField)}" fieldType="${
        exploreField.fieldType
    }">
        <Name>${exploreField.name}</Name>
        <Label>${exploreField.label}</Label>
        <Type>${exploreField.type}</Type>
        ${
            aiHints && aiHints.length > 0
                ? `
        <AI Hints>
            ${aiHints.map((hint) => `<Hint>${hint}</Hint>`).join('\n')}
        </AI Hints>`.trim()
                : ''
        }
        ${
            exploreField.tags && exploreField.tags.length > 0
                ? `<Tags>${exploreField.tags.join(', ')}</Tags>`
                : ''
        }
        <Table id="${exploreField.table}">${exploreField.tableLabel}</Table>
        <Usage alt="field usage in charts">${catalogField.chartUsage}</Usage>
        ${
            isEmojiIcon(catalogField.icon)
                ? `<Emoji>${catalogField.icon.unicode}</Emoji>`
                : ''
        }
        <Description>${catalogField.description}</Description>
    </Field>
    `.trim();
};

const getFieldsText = (args: {
    index: number;
    name: string;
    description: string;
    results: {
        catalogField: CatalogField;
        exploreField: CompiledDimension | CompiledMetric;
    }[];
}) =>
    `
<SearchResults index="${args.index}" name="${args.name}" description="${
        args.description
    }">
    ${args.results.map((field) => getFieldText(field)).join('\n\n')}
</SearchResults>
`.trim();

export const getFindFields = ({ findFields }: Dependencies) => {
    const schema = toolNewFindFieldsArgsSchema;

    return tool({
        description: `Use this tool to find the most relevant Fields (Metrics and Dimensions) across all available Explores based on the user's request.
If the results aren't satisfactory, retry with different search terms.`,
        parameters: schema,
        execute: async ({ fieldSearchQueries }) => {
            try {
                const fieldSearchQueryResults = await Promise.all(
                    fieldSearchQueries.map(async (fieldSearchQuery, index) => ({
                        index,
                        ...fieldSearchQuery,
                        results: await findFields({ fieldSearchQuery }),
                    })),
                );

                const fieldsText = fieldSearchQueryResults
                    .map((fieldSearchQueryResult) =>
                        getFieldsText(fieldSearchQueryResult),
                    )
                    .join('\n\n');

                return fieldsText;
            } catch (error) {
                return toolErrorHandler(
                    error,
                    // TODO: error
                    `Error finding fields.`,
                );
            }
        },
    });
};
