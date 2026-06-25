import { findFieldsToolDefinition, type Explore } from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindFieldFn,
    GetExploreFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { hasMinimumPreviewRank } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';
import { fieldToJson, renderField } from './fieldOutput';
import { stringifyToolJson, type ToolOutputFormat } from './toolOutputFormat';

type Dependencies = {
    getExplore: GetExploreFn;
    findFields: FindFieldFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
    outputFormat?: ToolOutputFormat;
};

const toolDefinition = findFieldsToolDefinition.for('agent');

const findFieldsNote =
    'Field descriptions are previews. Use findFields to compare candidates; once you know exact field ids that are likely to be used, call getFields for full details instead of re-searching known fields.';

const getFieldsJson = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
    explore?: Explore,
) => {
    const fields = args.fields.filter(hasMinimumPreviewRank);

    return {
        searchQuery: args.searchQuery,
        page: args.pagination?.page,
        pageSize: args.pagination?.pageSize,
        totalPageCount: args.pagination?.totalPageCount,
        totalResults: args.pagination?.totalResults,
        fieldCount: fields.length,
        note: findFieldsNote,
        fields: fields.map((field) =>
            fieldToJson({ field, explore, descriptionMode: 'preview' }),
        ),
    };
};

const getFieldsText = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
    explore?: Explore,
) => (
    <searchresult
        searchQuery={args.searchQuery}
        page={args.pagination?.page}
        pageSize={args.pagination?.pageSize}
        totalPageCount={args.pagination?.totalPageCount}
        totalResults={args.pagination?.totalResults}
    >
        <note>{findFieldsNote}</note>
        {args.fields.filter(hasMinimumPreviewRank).map((field) =>
            renderField({
                field,
                explore,
                descriptionMode: 'preview',
            }),
        )}
    </searchresult>
);

export const getFindFields = ({
    getExplore,
    findFields,
    updateProgress,
    pageSize,
    outputFormat = 'xml',
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

                const result =
                    outputFormat === 'json'
                        ? stringifyToolJson({
                              count: fieldSearchQueryResults.length,
                              searchResults: fieldSearchQueryResults.map(
                                  (fieldSearchQueryResult) =>
                                      getFieldsJson(
                                          fieldSearchQueryResult,
                                          explore,
                                      ),
                              ),
                          })
                        : (
                              <searchresults>
                                  {fieldSearchQueryResults
                                      .map((fieldSearchQueryResult) =>
                                          getFieldsText(
                                              fieldSearchQueryResult,
                                              explore,
                                          ),
                                      )
                                      .join('\n\n')}
                              </searchresults>
                          ).toString();

                return {
                    result,
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
