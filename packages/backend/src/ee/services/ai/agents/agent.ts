import { AnyType } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { CoreMessage, generateObject, generateText, NoSuchToolError } from 'ai';
import type { ZodType } from 'zod';

import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';

import { getFindFields } from '../tools/findFields';
import { getGenerateBarVizConfig } from '../tools/generateBarVizConfig';
import { getGenerateCsv } from '../tools/generateCsv';
import { getGenerateQueryFilters } from '../tools/generateQueryFilters';
import { getGenerateTimeSeriesVizConfig } from '../tools/generateTimeSeriesVizConfigTool';
import { getGetOneLineResult } from '../tools/getOneLineResult';

import Logger from '../../../../logging/logger';
import { getExploreInformationPrompt } from '../prompts/exploreInformation';
import { getSystemPrompt } from '../prompts/system';

import { getAiAgentModel } from '../models';

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
            agentName: args.agentName,
            instructions: args.instruction || undefined,
        }),
        getExploreInformationPrompt({
            exploreInformation: args.aiAgentExploreSummaries,
        }),
        ...args.messageHistory,
    ];

    const model = getAiAgentModel(
        args.provider,
        args.modelName,
        args.providerConfig,
    );

    try {
        const result = await generateText({
            model,
            tools,
            toolChoice: 'auto',
            messages,
            maxSteps: 10,
            maxRetries: 3,
            temperature: 0.2,
            experimental_repairToolCall: async ({
                messages: conversationHistory,
                error,
                toolCall,
                parameterSchema,
            }) => {
                if (NoSuchToolError.isInstance(error)) {
                    return null;
                }

                const tool = tools[toolCall.toolName as keyof typeof tools];

                // TODO: extract this as separate agent
                const { object: repairedArgs } = await generateObject({
                    model,
                    schema: tool.parameters as ZodType<AnyType>,
                    messages: [
                        ...conversationHistory,
                        {
                            role: 'system',
                            content: [
                                `The model tried to call the tool "${toolCall.toolName}"` +
                                    ` with the following arguments:`,
                                JSON.stringify(toolCall.args),
                                `The tool accepts the following schema:`,
                                JSON.stringify(parameterSchema(toolCall)),
                                'Please fix the arguments.',
                            ].join('\n'),
                        },
                    ],
                });

                return { ...toolCall, args: JSON.stringify(repairedArgs) };
            },
        });
        return result.text;
    } catch (error) {
        Logger.error(error);
        Sentry.captureException(error);
        throw error;
    }
};
