import {
    CatalogField,
    convertToAiHints,
    DEFAULT_FILTER_CASE_SENSITIVE,
    DimensionType,
    Explore,
    FieldType,
    findFieldsToolDefinition,
    getFilterTypeFromItemType,
    getItemId,
    isEmojiIcon,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindFieldFn,
    GetExploreFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { truncate } from '../utils/truncation';
import { formatToolJsonOutput } from './toolOutputFormat';

type Dependencies = {
    getExplore: GetExploreFn;
    findFields: FindFieldFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
    toolDescriptionMaxChars: number;
};

const toolDefinition = findFieldsToolDefinition.for('agent');

const getFieldCaseSensitive = (
    catalogField: CatalogField,
    explore?: Explore,
): boolean | undefined => {
    if (
        catalogField.fieldType !== FieldType.DIMENSION ||
        catalogField.fieldValueType !== DimensionType.STRING
    ) {
        return undefined;
    }

    const dimension =
        explore?.tables[catalogField.tableName]?.dimensions[catalogField.name];

    return (
        dimension?.caseSensitive ??
        explore?.caseSensitive ??
        DEFAULT_FILTER_CASE_SENSITIVE
    );
};

const formatField = (
    catalogField: CatalogField,
    toolDescriptionMaxChars: number,
    explore?: Explore,
) => {
    const isFromJoinedTable =
        explore &&
        catalogField.tableName !== explore.baseTable &&
        explore.joinedTables.some(
            (join) => join.table === catalogField.tableName,
        );
    const caseSensitiveFilters = getFieldCaseSensitive(catalogField, explore);

    const aiHints = convertToAiHints(catalogField.aiHints ?? undefined);

    return {
        type: catalogField.fieldType,
        baseTable: catalogField.tableName,
        name: catalogField.name,
        fieldId: getItemId({
            name: catalogField.name,
            table: catalogField.tableName,
        }),
        fieldType: catalogField.fieldValueType,
        fieldFilterType: getFilterTypeFromItemType(catalogField.fieldValueType),
        searchRank: catalogField.searchRank,
        chartUsage: catalogField.chartUsage,
        usageInVerifiedCharts: catalogField.verifiedChartUsage ?? 0,
        isFromJoinedTable: Boolean(isFromJoinedTable),
        caseSensitiveFilters: caseSensitiveFilters ?? null,
        note:
            isFromJoinedTable && explore
                ? `This field is from the "${catalogField.tableName}" table, which is joined to the "${explore.name}" explore. You can use this field in queries and filters just like fields from the base table.`
                : null,
        label: catalogField.label,
        aiHints: aiHints ?? [],
        description: catalogField.description
            ? truncate(catalogField.description, toolDescriptionMaxChars)
            : null,
        categories: catalogField.categories?.map((c) => c.name) ?? [],
        emoji: isEmojiIcon(catalogField.icon)
            ? catalogField.icon.unicode
            : null,
    };
};

const getFieldsText = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
    toolDescriptionMaxChars: number,
    explore?: Explore,
) => ({
    searchQuery: args.searchQuery,
    page: args.pagination?.page ?? null,
    pageSize: args.pagination?.pageSize ?? null,
    totalPageCount: args.pagination?.totalPageCount ?? null,
    totalResults: args.pagination?.totalResults ?? null,
    fields: args.fields.map((field) =>
        formatField(field, toolDescriptionMaxChars, explore),
    ),
});

export const getFindFields = ({
    getExplore,
    findFields,
    updateProgress,
    pageSize,
    toolDescriptionMaxChars,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const searchLabels = args.fieldSearchQueries
                    .map((q) => `"${q.label}"`)
                    .join(', ');
                await updateProgress(
                    `Searching for fields: ${searchLabels}${
                        args.table ? ` in "${args.table}"` : ''
                    }...`,
                );

                const explore = await getExplore({ table: args.table });

                const fieldSearchQueryResults = await Promise.all(
                    args.fieldSearchQueries.map(async (fieldSearchQuery) => {
                        const result = await findFields({
                            table: args.table,
                            fieldSearchQuery,
                            page: args.page ?? 1,
                            pageSize,
                            explore,
                        });
                        return {
                            searchQuery: fieldSearchQuery.label,
                            ...result,
                        };
                    }),
                );

                const searchResults = fieldSearchQueryResults.map(
                    (fieldSearchQueryResult) =>
                        getFieldsText(
                            fieldSearchQueryResult,
                            toolDescriptionMaxChars,
                            explore,
                        ),
                );

                return {
                    result: formatToolJsonOutput({ searchResults }),
                    metadata: {
                        status: 'success',
                        ranking: {
                            searchQueries: fieldSearchQueryResults.map(
                                (fieldSearchQueryResult) => ({
                                    label: fieldSearchQueryResult.searchQuery,
                                    results: fieldSearchQueryResult.fields.map(
                                        (field) => ({
                                            name: field.name,
                                            label: field.label,
                                            tableName: field.tableName,
                                            fieldType: field.fieldType,
                                            searchRank: field.searchRank,
                                            chartUsage: field.chartUsage,
                                            verifiedChartUsage:
                                                field.verifiedChartUsage,
                                        }),
                                    ),
                                    pagination:
                                        fieldSearchQueryResult.pagination,
                                }),
                            ),
                        },
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
        toModelOutput: ({ output }) => toModelOutput(output),
    });
