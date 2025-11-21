import {
    toolFindExploresArgsSchemaV3,
    toolFindExploresOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    fieldSearchSize: number;
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
};

const generateExploreResponse = ({
    searchQuery,
    exploreSearchResults,
    topMatchingFields,
}: Awaited<ReturnType<FindExploresFn>> & { searchQuery: string }) => {
    const searchResultsXml =
        exploreSearchResults && exploreSearchResults.length > 0 ? (
            <searchResults
                searchQuery={searchQuery}
                count={exploreSearchResults.length}
            >
                <note>
                    {exploreSearchResults.length === 1
                        ? 'One explore matched your search. Call findFields for this explore to get all its dimensions and metrics.'
                        : 'Multiple explores matched your search. Use topMatchingFields below and apply Rule 2 (ambiguity check) to determine which explore to use, then call findFields for that explore.'}
                </note>
                {exploreSearchResults.map((result) => (
                    <alternative
                        name={result.name}
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
                    </alternative>
                ))}
            </searchResults>
        ) : null;

    const topFieldsXml =
        topMatchingFields && topMatchingFields.length > 0 ? (
            <topMatchingFields count={topMatchingFields.length}>
                <note>
                    Here are the top matching fields across all explores. Use
                    this to determine which explore is most relevant by applying
                    Rule 2 (ambiguity check).
                </note>
                {topMatchingFields.map((field) => (
                    <field
                        name={field.name}
                        label={field.label}
                        exploreName={field.tableName}
                        fieldType={field.fieldType}
                        searchRank={field.searchRank?.toFixed(3) ?? 'N/A'}
                        usageInCharts={field.chartUsage ?? 0}
                    >
                        {field.description && (
                            <description>{field.description}</description>
                        )}
                    </field>
                ))}
            </topMatchingFields>
        ) : null;

    return `${searchResultsXml ? `${searchResultsXml.toString()}\n` : ''}${
        topFieldsXml ? `${topFieldsXml.toString()}\n` : ''
    }`;
};
export const getFindExplores = ({
    findExplores,
    updateProgress,
    fieldSearchSize,
}: Dependencies) =>
    tool({
        description: toolFindExploresArgsSchemaV3.description,
        inputSchema: toolFindExploresArgsSchemaV3,
        outputSchema: toolFindExploresOutputSchema,
        execute: async (args) => {
            try {
                await updateProgress(
                    `🔍 Searching explores matching query: \`${args.searchQuery}\`...`,
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
        toModelOutput: (output) => toModelOutput(output),
    });
