import {
    assertUnreachable,
    CatalogField,
    convertToAiHints,
    FieldType,
    getFilterTypeFromItemType,
    getItemId,
    isEmojiIcon,
    toolFindFieldsArgsSchema,
    toolFindFieldsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import type { FindFieldFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    findFields: FindFieldFn;
    pageSize: number;
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
    })}" fieldType="${
        catalogField.fieldValueType
    }" fieldFilterType="${getFilterTypeFromItemType(
        catalogField.fieldValueType,
    )}">
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
        <description>${catalogField.description}</description>
    </${fieldTypeLabel}>
    `.trim();
};

const getFieldsText = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
) =>
    `
<SearchResult searchQuery="${args.searchQuery}" page="${
        args.pagination?.page
    }" pageSize="${args.pagination?.pageSize}" totalPageCount="${
        args.pagination?.totalPageCount
    }" totalResults="${args.pagination?.totalResults}">
    ${args.fields.map((field) => getFieldText(field)).join('\n\n')}
</SearchResult>
`.trim();

export const getFindFields = ({ findFields, pageSize }: Dependencies) =>
    tool({
        description: toolFindFieldsArgsSchema.description,
        inputSchema: toolFindFieldsArgsSchema,
        outputSchema: toolFindFieldsOutputSchema,
        execute: async (args) => {
            try {
                const fieldSearchQueryResults = await Promise.all(
                    args.fieldSearchQueries.map(async (fieldSearchQuery) => ({
                        searchQuery: fieldSearchQuery.label,
                        ...(await findFields({
                            table: args.table,
                            fieldSearchQuery,
                            page: args.page ?? 1,
                            pageSize,
                        })),
                    })),
                );

                const fieldsText = fieldSearchQueryResults
                    .map((fieldSearchQueryResult) =>
                        getFieldsText(fieldSearchQueryResult),
                    )
                    .join('\n\n');

                return {
                    result: `<SearchResults>${fieldsText}</SearchResults>`,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error finding fields for search queries: ${args.fieldSearchQueries
                            .map((q) => q.label)
                            .join(', ')}`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
