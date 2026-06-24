import { findFieldsToolDefinition, type Explore } from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindFieldFn,
    GetExploreFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';
import { renderField } from './fieldOutput';

type Dependencies = {
    getExplore: GetExploreFn;
    findFields: FindFieldFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
};

const toolDefinition = findFieldsToolDefinition.for('agent');

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
        <note>
            Field descriptions are previews and may end with " ... (truncated)".
        </note>
        {args.fields.map((field) =>
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

                const fieldsText = fieldSearchQueryResults
                    .map((fieldSearchQueryResult) =>
                        getFieldsText(fieldSearchQueryResult, explore),
                    )
                    .join('\n\n');

                return {
                    result: (
                        <searchresults>{fieldsText}</searchresults>
                    ).toString(),
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
