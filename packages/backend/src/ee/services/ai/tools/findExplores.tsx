import { findExploresToolDefinition, getItemId } from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { hasMinimumPreviewRank } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';
import { stringifyToolJson, type ToolOutputFormat } from './toolOutputFormat';

type Dependencies = {
    fieldSearchSize: number;
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
    outputFormat?: ToolOutputFormat;
};

const toolDefinition = findExploresToolDefinition.for('agent');

type TopMatchingExploreField = NonNullable<
    Awaited<ReturnType<FindExploresFn>>['topMatchingFields']
>[number];

const getFieldOutput = (field: TopMatchingExploreField) => ({
    name: field.name,
    label: field.label,
    fieldId: getItemId({
        name: field.name,
        table: field.tableName,
    }),
    exploreName: field.tableName,
    fieldType: field.fieldType,
    searchRank: field.searchRank?.toFixed(3) ?? 'N/A',
    usageInCharts: field.chartUsage ?? 0,
    usageInVerifiedCharts: field.verifiedChartUsage ?? 0,
});

const getVisibleResults = ({
    exploreSearchResults,
    topMatchingFields,
    topMatchingDimensions,
    topMatchingMetrics,
}: Pick<
    Awaited<ReturnType<FindExploresFn>>,
    | 'exploreSearchResults'
    | 'topMatchingFields'
    | 'topMatchingDimensions'
    | 'topMatchingMetrics'
>) => {
    const fallbackTopMatchingFields = [
        ...(topMatchingDimensions ?? []),
        ...(topMatchingMetrics ?? []),
    ];
    const visibleTopMatchingFields = (
        topMatchingFields ?? fallbackTopMatchingFields
    ).filter(hasMinimumPreviewRank);
    const visibleTopMatchingDimensions = (
        topMatchingDimensions ??
        visibleTopMatchingFields.filter(
            (field) => field.fieldType === 'dimension',
        )
    ).filter(hasMinimumPreviewRank);
    const visibleTopMatchingMetrics = (
        topMatchingMetrics ??
        visibleTopMatchingFields.filter((field) => field.fieldType === 'metric')
    ).filter(hasMinimumPreviewRank);

    return {
        visibleExploreSearchResults:
            exploreSearchResults?.filter(hasMinimumPreviewRank) ?? [],
        visibleTopMatchingFields,
        visibleTopMatchingDimensions,
        visibleTopMatchingMetrics,
    };
};

const getFindExploresNotes = (exploreCount: number, fieldCount: number) => {
    const searchResultsNote = (() => {
        if (exploreCount === 0) {
            return fieldCount > 0
                ? 'No explore name/label/description/aiHints matched. Use topMatchingDimensions and topMatchingMetrics below, then call findFields on the most relevant explore.'
                : 'No explore matched your search. Try different terms or synonyms.';
        }
        if (exploreCount === 1) {
            return 'One explore matched your search. Call findFields for this explore to get all its dimensions and metrics.';
        }
        return "Multiple explores matched. Pick the explore whose fields can answer the user's question (a follow-up query runs against a single explore), using topMatchingDimensions and topMatchingMetrics to compare field-level relevance. Then call findFields on it.";
    })();

    const topFieldsNote =
        fieldCount === 0
            ? 'No field-level matches either.'
            : "Per-field matches across all explores split into topMatchingDimensions and topMatchingMetrics. Each field's `exploreName` shows where it lives — pick the explore whose fields can answer the user's question. Field descriptions are omitted here; use getFields only for exact fieldIds shown in this output; use findFields before looking up any field that was not returned.";

    return { searchResultsNote, topFieldsNote };
};

const generateExploreJsonResponse = ({
    searchQuery,
    exploreSearchResults,
    topMatchingFields,
    topMatchingDimensions,
    topMatchingMetrics,
}: Awaited<ReturnType<FindExploresFn>> & { searchQuery: string }) => {
    const {
        visibleExploreSearchResults,
        visibleTopMatchingFields,
        visibleTopMatchingDimensions,
        visibleTopMatchingMetrics,
    } = getVisibleResults({
        exploreSearchResults,
        topMatchingFields,
        topMatchingDimensions,
        topMatchingMetrics,
    });
    const fieldCount = visibleTopMatchingFields.length;
    const { searchResultsNote, topFieldsNote } = getFindExploresNotes(
        visibleExploreSearchResults.length,
        fieldCount,
    );

    return stringifyToolJson({
        searchQuery,
        description:
            "Two-pass catalog search whose goal is to identify the single explore for a follow-up query: a query runs against exactly one explore, so the chosen explore must contain the fields needed to answer the user's question. topMatchingExplores lists explores whose name/label/description/aiHints matched the query. topMatchingDimensions and topMatchingMetrics list individual fields whose name/label/description matched, across all explores — use them to identify or disambiguate the explore to dig into when no explore matched directly, or when several matched.",
        topMatchingExplores: {
            count: visibleExploreSearchResults.length,
            note: searchResultsNote,
            items: visibleExploreSearchResults.map((result) => ({
                exploreName: result.name,
                label: result.label,
                searchRank: result.searchRank?.toFixed(3) ?? 'N/A',
                description: result.description,
                aiHints: result.aiHints,
                joinedTables:
                    result.joinedTables && result.joinedTables.length > 0
                        ? {
                              count: result.joinedTables.length,
                              note: 'Fields from these joined tables are available when querying this explore',
                              tables: result.joinedTables,
                          }
                        : undefined,
            })),
        },
        topMatchingFields: {
            count: visibleTopMatchingFields.length,
            note: topFieldsNote,
            items: visibleTopMatchingFields.map(getFieldOutput),
        },
        topMatchingDimensions: {
            count: visibleTopMatchingDimensions.length,
            note: topFieldsNote,
            items: visibleTopMatchingDimensions.map(getFieldOutput),
        },
        topMatchingMetrics: {
            count: visibleTopMatchingMetrics.length,
            note: topFieldsNote,
            items: visibleTopMatchingMetrics.map(getFieldOutput),
        },
    });
};

const generateExploreXmlResponse = ({
    searchQuery,
    exploreSearchResults,
    topMatchingFields,
    topMatchingDimensions,
    topMatchingMetrics,
}: Awaited<ReturnType<FindExploresFn>> & { searchQuery: string }) => {
    const {
        visibleExploreSearchResults,
        visibleTopMatchingFields,
        visibleTopMatchingDimensions,
        visibleTopMatchingMetrics,
    } = getVisibleResults({
        exploreSearchResults,
        topMatchingFields,
        topMatchingDimensions,
        topMatchingMetrics,
    });
    const exploreCount = visibleExploreSearchResults.length;
    const fieldCount = visibleTopMatchingFields.length;
    const { searchResultsNote, topFieldsNote } = getFindExploresNotes(
        exploreCount,
        fieldCount,
    );

    return (
        <findExplores searchQuery={searchQuery}>
            <description>
                Two-pass catalog search whose goal is to identify the single
                explore for a follow-up query: a query runs against exactly one
                explore, so the chosen explore must contain the fields needed to
                answer the user's question. `searchResults` lists explores whose
                name/label/description/aiHints matched the query.
                `topMatchingDimensions` and `topMatchingMetrics` list individual
                fields whose name/label/description matched, across all explores
                — use them to identify or disambiguate the explore to dig into
                when no explore matched directly, or when several matched.
            </description>
            <topMatchingExplores count={exploreCount}>
                <note>{searchResultsNote}</note>
                {visibleExploreSearchResults.map((result) => (
                    <explore
                        exploreName={result.name}
                        label={result.label}
                        searchRank={result.searchRank?.toFixed(3) ?? 'N/A'}
                    >
                        {result.description && (
                            <description>{result.description}</description>
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
                    </explore>
                ))}
            </topMatchingExplores>

            <topMatchingFields count={visibleTopMatchingFields.length}>
                <note>{topFieldsNote}</note>
                {visibleTopMatchingFields.map((field) => (
                    <field {...getFieldOutput(field)} />
                ))}
            </topMatchingFields>

            <topMatchingDimensions count={visibleTopMatchingDimensions.length}>
                <note>{topFieldsNote}</note>
                {visibleTopMatchingDimensions.map((field) => (
                    <field {...getFieldOutput(field)} />
                ))}
            </topMatchingDimensions>

            <topMatchingMetrics count={visibleTopMatchingMetrics.length}>
                <note>{topFieldsNote}</note>
                {visibleTopMatchingMetrics.map((field) => (
                    <field {...getFieldOutput(field)} />
                ))}
            </topMatchingMetrics>
        </findExplores>
    ).toString();
};

const toRankingField = (field: TopMatchingExploreField) => ({
    name: field.name,
    label: field.label,
    tableName: field.tableName,
    fieldType: field.fieldType,
    searchRank: field.searchRank,
    chartUsage: field.chartUsage,
    verifiedChartUsage: field.verifiedChartUsage,
});

export const getFindExplores = ({
    findExplores,
    updateProgress,
    fieldSearchSize,
    outputFormat = 'xml',
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                await updateProgress(
                    `Searching explores matching query: "${args.searchQuery}"...`,
                );

                const {
                    exploreSearchResults,
                    topMatchingFields,
                    topMatchingDimensions,
                    topMatchingMetrics,
                } = await findExplores({
                    fieldSearchSize,
                    searchQuery: args.searchQuery,
                });

                return {
                    result:
                        outputFormat === 'json'
                            ? generateExploreJsonResponse({
                                  searchQuery: args.searchQuery,
                                  exploreSearchResults,
                                  topMatchingFields,
                                  topMatchingDimensions,
                                  topMatchingMetrics,
                              })
                            : generateExploreXmlResponse({
                                  searchQuery: args.searchQuery,
                                  exploreSearchResults,
                                  topMatchingFields,
                                  topMatchingDimensions,
                                  topMatchingMetrics,
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
                            topMatchingFields:
                                topMatchingFields?.map(toRankingField),
                            topMatchingDimensions:
                                topMatchingDimensions?.map(toRankingField),
                            topMatchingMetrics:
                                topMatchingMetrics?.map(toRankingField),
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
