import { findExploresToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { truncate } from '../utils/truncation';
import { formatToolJsonOutput } from './toolOutputFormat';

type Dependencies = {
    fieldSearchSize: number;
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
    toolDescriptionMaxChars: number;
};

const toolDefinition = findExploresToolDefinition.for('agent');

const generateExploreResponse = ({
    searchQuery,
    exploreSearchResults,
    topMatchingFields,
    toolDescriptionMaxChars,
}: Awaited<ReturnType<FindExploresFn>> & {
    searchQuery: string;
    toolDescriptionMaxChars: number;
}) => {
    const exploreCount = exploreSearchResults?.length ?? 0;
    const fieldCount = topMatchingFields?.length ?? 0;

    const searchResultsNote = (() => {
        if (exploreCount === 0) {
            return fieldCount > 0
                ? 'No explore name/label/description/aiHints matched. Use topMatchingFields below and call findFields on the most relevant explore.'
                : 'No explore matched your search. Try different terms or synonyms.';
        }
        if (exploreCount === 1) {
            return 'One explore matched your search. Call findFields for this explore to get all its dimensions and metrics.';
        }
        return "Multiple explores matched. Pick the explore whose fields can answer the user's question (a follow-up query runs against a single explore), using topMatchingFields to compare field-level relevance. Then call findFields on it.";
    })();

    const topFieldsNote =
        fieldCount === 0
            ? 'No field-level matches either.'
            : "Per-field matches across all explores. Each field's `exploreName` shows where it lives — pick the explore whose fields can answer the user's question.";

    return formatToolJsonOutput({
        searchQuery,
        description:
            "Two-pass catalog search whose goal is to identify the single explore for a follow-up query: a query runs against exactly one explore, so the chosen explore must contain the fields needed to answer the user's question. `searchResults` lists explores whose name/label/description/aiHints matched the query. `topMatchingFields` lists individual fields whose name/label/description matched, across all explores — use it to identify or disambiguate the explore to dig into when no explore matched directly, or when several matched.",
        searchResults: {
            count: exploreCount,
            note: searchResultsNote,
            results:
                exploreSearchResults?.map((result) => ({
                    name: result.name,
                    label: result.label,
                    searchRank: result.searchRank?.toFixed(3) ?? 'N/A',
                    description: result.description
                        ? truncate(result.description, toolDescriptionMaxChars)
                        : null,
                    aiHints: result.aiHints ?? [],
                    joinedTables: {
                        count: result.joinedTables?.length ?? 0,
                        note:
                            result.joinedTables &&
                            result.joinedTables.length > 0
                                ? 'Fields from these joined tables are available when querying this explore'
                                : null,
                        tables: result.joinedTables ?? [],
                    },
                    requiredFilters: result.requiredFilters ?? [],
                })) ?? [],
        },
        topMatchingFields: {
            count: fieldCount,
            note: topFieldsNote,
            fields:
                topMatchingFields?.map((field) => ({
                    name: field.name,
                    label: field.label,
                    exploreName: field.tableName,
                    fieldType: field.fieldType,
                    searchRank: field.searchRank?.toFixed(3) ?? 'N/A',
                    usageInCharts: field.chartUsage ?? 0,
                    usageInVerifiedCharts: field.verifiedChartUsage ?? 0,
                })) ?? [],
        },
    });
};
export const getFindExplores = ({
    findExplores,
    updateProgress,
    fieldSearchSize,
    toolDescriptionMaxChars,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                await updateProgress(
                    `Searching explores matching query: "${args.searchQuery}"...`,
                );

                const { exploreSearchResults, topMatchingFields } =
                    await findExplores({
                        fieldSearchSize,
                        searchQuery: args.searchQuery,
                    });

                return {
                    result: generateExploreResponse({
                        searchQuery: args.searchQuery,
                        exploreSearchResults,
                        topMatchingFields,
                        toolDescriptionMaxChars,
                    }),
                    metadata: {
                        status: 'success',
                        ranking: {
                            searchQuery: args.searchQuery,
                            exploreSearchResults: exploreSearchResults?.map(
                                (result) => ({
                                    name: result.name,
                                    label: result.label,
                                    searchRank: result.searchRank,
                                    joinedTables: result.joinedTables ?? [],
                                    ...(result.requiredFilters &&
                                    result.requiredFilters.length > 0
                                        ? {
                                              requiredFilters:
                                                  result.requiredFilters,
                                          }
                                        : {}),
                                }),
                            ),
                            topMatchingFields: topMatchingFields?.map(
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
                        },
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, `Error listing explores.`),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
