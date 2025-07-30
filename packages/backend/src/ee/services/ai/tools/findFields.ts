import {
    assertUnreachable,
    CatalogField,
    convertToAiHints,
    FieldType,
    getItemId,
    isEmojiIcon,
    KnexPaginateArgs,
    toolFindFieldsArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { FindFieldFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findFields: FindFieldFn;
};

const fieldKindLabel = (fieldType: FieldType) => {
    switch (fieldType) {
        case FieldType.DIMENSION:
            return 'Dimension';
        case FieldType.METRIC:
            return 'Metric';
        default:
            return assertUnreachable(fieldType, 'Invalid field type');
    }
};

const getFieldText = (catalogField: CatalogField) => {
    const aiHints = convertToAiHints(catalogField.aiHints ?? undefined);

    const fieldTypeLabel = fieldKindLabel(catalogField.fieldType);

    if (!catalogField.basicType) {
        throw new Error('Field basic type is required');
    }

    return `
    <${fieldTypeLabel} fieldId="${getItemId({
        name: catalogField.name,
        table: catalogField.tableName,
    })}" fieldType="${catalogField.fieldValueType}" fieldFilterType="${
        catalogField.basicType
    }">
        <Name>${catalogField.name}</Name>
        <Label>${catalogField.label}</Label>
        <SearchRank>${catalogField.searchRank}</SearchRank>
        ${
            aiHints && aiHints.length > 0
                ? `
        <AI Hints>
            ${aiHints.map((hint) => `<Hint>${hint}</Hint>`).join('\n')}
        </AI Hints>`.trim()
                : ''
        }
        ${
            catalogField.categories && catalogField.categories.length > 0
                ? `<Categories>${catalogField.categories
                      .map((c) => c.name)
                      .join(', ')}</Categories>`
                : ''
        }
        <Table name="${catalogField.tableName}">${
        catalogField.tableLabel
    }</Table>
        <UsageInCharts>${catalogField.chartUsage}</UsageInCharts>
        ${
            isEmojiIcon(catalogField.icon)
                ? `<Emoji>${catalogField.icon.unicode}</Emoji>`
                : ''
        }
        <Description>${catalogField.description}</Description>
    </${fieldTypeLabel}>
    `.trim();
};

const getFieldsText = (args: {
    searchQuery: string;
    fields: CatalogField[];
    pagination:
        | (KnexPaginateArgs & {
              totalPageCount: number;
              totalResults: number;
          })
        | undefined;
}) =>
    `
<SearchResults searchQuery="${args.searchQuery}" page="${
        args.pagination?.page
    }" pageSize="${args.pagination?.pageSize}" totalPageCount="${
        args.pagination?.totalPageCount
    }" totalResults="${args.pagination?.totalResults}">
    ${args.fields.map((field) => getFieldText(field)).join('\n\n')}
</SearchResults>
`.trim();

export const getFindFields = ({ findFields }: Dependencies) => {
    const schema = toolFindFieldsArgsSchema;

    return tool({
        description: `Tool: "findFields"

Purpose:
Finds the most relevant Fields (Metrics & Dimensions) within Explores, returning detailed info about each.

Usage tips:
- Use "findExplores" first to discover available Explores and their field labels.
- Use full field labels in search terms (e.g. "Total Revenue", "Order Date").
- Pass all needed fields in one request.
- Fields are sorted by relevance, with a maximum score of 1 and a minimum of 0, so the top results are the most relevant.
- If results aren't relevant, retry with clearer or more specific terms.
- Results are paginated — use the next page token to get more results if needed.
`,
        parameters: schema,
        execute: async (args) => {
            try {
                const fieldSearchQueryResults = await Promise.all(
                    args.fieldSearchQueries.map(async (fieldSearchQuery) => ({
                        searchQuery: fieldSearchQuery.label,
                        ...(await findFields({
                            table: args.table,
                            fieldSearchQuery,
                            page: args.page ?? 1,
                            pageSize: 10,
                        })),
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
                    `Error finding fields for search queries: ${args.fieldSearchQueries
                        .map((q) => q.label)
                        .join(', ')}`,
                );
            }
        },
    });
};
