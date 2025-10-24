import {
    AnyType,
    ItemsMap,
    toolRunSavedChartQueryArgsSchema,
    toolRunSavedChartQueryOutputSchema,
    type ToolRunSavedChartQueryArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    GetPromptFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    runSavedChartQuery: (args: {
        chartUuid: string;
        versionUuid?: string;
        limit?: number | null;
    }) => Promise<{
        rows: Record<string, AnyType>[];
        fields: ItemsMap;
    }>;
    updateProgress: UpdateProgressFn;
    getPrompt: GetPromptFn;
};

export const getRunSavedChartQuery = ({
    runSavedChartQuery,
    updateProgress,
    getPrompt,
}: Dependencies) =>
    tool({
        description: toolRunSavedChartQueryArgsSchema.description,
        inputSchema: toolRunSavedChartQueryArgsSchema,
        outputSchema: toolRunSavedChartQueryOutputSchema,
        execute: async (toolArgs: ToolRunSavedChartQueryArgs) => {
            try {
                await updateProgress('📊 Running saved chart query...');

                const prompt = await getPrompt();

                // Execute query and wait for results (polling is handled in the dependency)
                const { rows, fields } = await runSavedChartQuery({
                    chartUuid: toolArgs.chartUuid,
                    limit: toolArgs.limit,
                });

                // Check if we have results
                if (!rows || rows.length === 0) {
                    return {
                        result: 'No results found for this saved chart query.',
                        metadata: { status: 'success' },
                    };
                }

                // Convert results to CSV for AI consumption
                const csv = convertQueryResultsToCsv({
                    rows,
                    fields,
                    cacheMetadata: { cacheHit: false },
                });

                return {
                    result: serializeData(csv, 'csv'),
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error running saved chart query.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
