import {
    findExploresToolDefinition,
    type ToolFindExploresOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { stringifyToolJson } from './toolOutputFormat';

type Dependencies = {
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
    fieldSearchSize?: number;
    toolDescriptionMaxChars?: number;
};

const toolDefinition = findExploresToolDefinition.for('agent');

const getExploreStructuredResponse = ({
    searchQuery,
    exploreSearchResults,
}: Awaited<ReturnType<FindExploresFn>> & { searchQuery: string }) => ({
    searchQuery,
    explores: (exploreSearchResults ?? []).map((result) => ({
        exploreName: result.name,
        label: result.label,
        searchRank: result.searchRank,
        description: result.description,
        aiHints: result.aiHints ?? [],
        joinedTables: result.joinedTables ?? [],
        requiredFilters: result.requiredFilters ?? [],
        dimensions: result.fields?.dimensions ?? [],
        metrics: result.fields?.metrics ?? [],
    })),
});

export type FindExploresStructuredResult = ReturnType<
    typeof getExploreStructuredResponse
>;

export const getFindExplores = ({
    findExplores,
    updateProgress,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                await updateProgress(
                    `Searching explores matching query: "${args.searchQuery}"...`,
                );

                const { exploreSearchResults } = await findExplores({
                    searchQuery: args.searchQuery,
                });

                const structuredResult = getExploreStructuredResponse({
                    searchQuery: args.searchQuery,
                    exploreSearchResults,
                });

                return {
                    result: stringifyToolJson(structuredResult),
                    structuredResult,
                    metadata: {
                        status: 'success',
                        ranking: structuredResult,
                    },
                } as ToolFindExploresOutput;
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
