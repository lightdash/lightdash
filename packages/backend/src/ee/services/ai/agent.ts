import moment from 'moment';

import { createOpenAI } from '@ai-sdk/openai';
import { CoreMessage, generateText } from 'ai';

import { getFindFields } from './tools/findFields';
import { getGenerateBarVizConfig } from './tools/generateBarVizConfig';
import { getGenerateCsv } from './tools/generateCsv';
import { getGenerateQueryFilters } from './tools/generateQueryFilters';
import { getGenerateTimeSeriesVizConfig } from './tools/generateTimeSeriesVizConfigTool';
import { getGetOneLineResult } from './tools/getOneLineResult';

import { getExploreInformationPrompt } from './prompts/exploreInformation';
import { getSystemPrompt } from './prompts/system';
import type { AiAgentArgs, AiAgentDependencies } from './types/aiAgent';

export const runAgent = async ({
    args,
    dependencies,
}: {
    args: AiAgentArgs;
    dependencies: AiAgentDependencies;
}): Promise<string> => {
    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        searchFields: dependencies.searchFields,
    });

    const generateQueryFilters = getGenerateQueryFilters({
        getExplore: dependencies.getExplore,
        promptUuid: args.promptUuid,
        updatePrompt: dependencies.updatePrompt,
    });

    const generateBarVizConfig = getGenerateBarVizConfig({
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
    });

    const generateTimeSeriesVizConfig = getGenerateTimeSeriesVizConfig({
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
    });

    const generateCsv = getGenerateCsv({
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
        sendFile: dependencies.sendFile,
        maxLimit: args.maxLimit,
    });

    const getOneLineResult = getGetOneLineResult({
        updateProgress: dependencies.updateProgress,
        runMiniMetricQuery: dependencies.runMiniMetricQuery,
        getPrompt: dependencies.getPrompt,
        updatePrompt: dependencies.updatePrompt,
    });

    const tools = {
        findFields,
        generateQueryFilters,
        generateBarVizConfig,
        generateCsv,
        generateTimeSeriesVizConfig,
        getOneLineResult,
    };

    const messages: CoreMessage[] = [
        getSystemPrompt({
            agentName: args.agentName || 'Lightdash AI Analyst',
            instructions: args.instruction || 'No instructions provided',
            date: moment().utc().format('YYYY-MM-DD'),
            time: moment().utc().format('HH:mm'),
        }),
        getExploreInformationPrompt({
            exploreInformation: args.aiAgentExploreSummaries,
        }),
        ...args.messageHistory,
    ];

    const openai = createOpenAI({
        apiKey: args.openaiApiKey,
        compatibility: 'strict',
    });

    const model = openai('gpt-4.1');

    const result = await generateText({
        model,
        tools,
        messages,
        maxSteps: 10,
        maxRetries: 3,
        temperature: 0.2,
    });

    return result.text;
};
