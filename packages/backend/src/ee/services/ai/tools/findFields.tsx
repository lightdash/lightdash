import {
    findFieldsToolDefinition,
    type Explore,
    type ToolFindFieldsOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindFieldFn,
    GetExploreFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { fieldToJson } from './fieldOutput';
import { stringifyToolJson } from './toolOutputFormat';

type Dependencies = {
    getExplore: GetExploreFn;
    findFields: FindFieldFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
};

const toolDefinition = findFieldsToolDefinition.for('agent');

const findFieldsNote =
    'Field descriptions are full, untruncated catalog descriptions. Use findFields to compare candidates; once you know exact field ids that are likely to be used, call listFields for exact lookup/validation instead of re-searching known fields.';

const getSearchResultOutput = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
    explore: Explore,
) => {
    const { fields } = args;

    return {
        searchQuery: args.searchQuery,
        page: args.pagination?.page,
        pageSize: args.pagination?.pageSize,
        totalPageCount: args.pagination?.totalPageCount,
        totalResults: args.pagination?.totalResults,
        fieldCount: fields.length,
        note: findFieldsNote,
        fields: fields.map((field) => fieldToJson({ field, explore })),
    };
};

const getStructuredResponse = ({
    fieldSearchQueryResults,
    explore,
}: {
    fieldSearchQueryResults: Array<
        Awaited<ReturnType<FindFieldFn>> & { searchQuery: string }
    >;
    explore: Explore;
}) => ({
    count: fieldSearchQueryResults.length,
    searchResults: fieldSearchQueryResults.map((fieldSearchQueryResult) =>
        getSearchResultOutput(fieldSearchQueryResult, explore),
    ),
});

export type FindFieldsStructuredResult = ReturnType<
    typeof getStructuredResponse
>;

export const getFindFields = ({
    getExplore,
    findFields,
    updateProgress,
    pageSize,
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

                const structuredResult = getStructuredResponse({
                    fieldSearchQueryResults,
                    explore,
                });

                return {
                    result: stringifyToolJson(structuredResult),
                    structuredResult,
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
                } as ToolFindFieldsOutput;
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
