import { findExploresToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { EXPLORE_DESCRIPTION_MAX_CHARS, truncate } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    fieldSearchSize: number;
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = findExploresToolDefinition.for('agent');

const generateExploreResponse = ({
    searchQuery,
    exploreSearchResults,
    topMatchingFields,
}: Awaited<ReturnType<FindExploresFn>> & { searchQuery: string }) => {
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

    return (
        <findExplores searchQuery={searchQuery}>
            <description>
                Two-pass catalog search whose goal is to identify the single
                explore for a follow-up query: a query runs against exactly one
                explore, so the chosen explore must contain the fields needed to
                answer the user's question. `searchResults` lists explores whose
                name/label/description/aiHints matched the query.
                `topMatchingFields` lists individual fields whose
                name/label/description matched, across all explores — use it to
                identify or disambiguate the explore to dig into when no explore
                matched directly, or when several matched.
            </description>
            <searchResults count={exploreCount}>
                <note>{searchResultsNote}</note>
                {exploreSearchResults?.map((result) => (
                    <alternative
                        name={result.name}
                        label={result.label}
                        searchRank={result.searchRank?.toFixed(3) ?? 'N/A'}
                    >
                        {result.description && (
                            <description>
                                {truncate(
                                    result.description,
                                    EXPLORE_DESCRIPTION_MAX_CHARS,
                                )}
                            </description>
                        )}
                        {result.aiHints && result.aiHints.length > 0 && (
                            <aiHints>
                                {result.aiHints.map((hint) => (
                                    <hint>{hint}</hint>
                                ))}
                            </aiHints>
                        )}
                        {result.joinedTables &&
                            result.joinedTables.length > 0 && (
                                <joinedTables
                                    count={result.joinedTables.length}
                                >
                                    <note>
                                        Fields from these joined tables are
                                        available when querying this explore
                                    </note>
                                    {result.joinedTables.map((tableName) => (
                                        <table>{tableName}</table>
                                    ))}
                                </joinedTables>
                            )}
                    </alternative>
                ))}
            </searchResults>
            <topMatchingFields count={fieldCount}>
                <note>{topFieldsNote}</note>
                {topMatchingFields?.map((field) => (
                    <field
                        name={field.name}
                        label={field.label}
                        exploreName={field.tableName}
                        fieldType={field.fieldType}
                        searchRank={field.searchRank?.toFixed(3) ?? 'N/A'}
                        usageInCharts={field.chartUsage ?? 0}
                        usageInVerifiedCharts={field.verifiedChartUsage ?? 0}
                    />
                ))}
            </topMatchingFields>
        </findExplores>
    ).toString();
};
export const getFindExplores = ({
    findExplores,
    updateProgress,
    fieldSearchSize,
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
