import { type Explore } from '@lightdash/common';
import {
    Output,
    smoothStream,
    stepCountIs,
    streamText,
    type CallSettings,
    type LanguageModel,
    type ModelMessage,
    type StreamTextResult,
} from 'ai';
import { z } from 'zod';
import Logger from '../../../../../logging/logger';
import { getFindExplores } from '../../tools/findExplores';
import { getFindFields } from '../../tools/findFields';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import {
    discoverFieldsSelectionSchema,
    type DiscoverFieldsInput,
} from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 50;

const isSubagentPersistedToolName = (
    name: string,
): name is 'findExplores' | 'findFields' =>
    name === 'findExplores' || name === 'findFields';

const persistedToolOutputSchema = z.object({
    result: z.string(),
    metadata: z.record(z.unknown()).nullable().optional(),
});

const storeableToolArgsSchema = z.object({}).passthrough();

const getStoreableToolArgs = (input: unknown): object => {
    const parsed = storeableToolArgsSchema.safeParse(input);

    return parsed.success ? parsed.data : {};
};

const discoverFieldsSelectionOutput = Output.object({
    schema: discoverFieldsSelectionSchema,
    name: 'discoverFieldsSelection',
    description:
        'Final discoverFields handoff containing only selected explore and field identifiers.',
});

export type DiscoverFieldsAgentDependencies = Pick<
    AiAgentDependencies,
    | 'findExplores'
    | 'findFields'
    | 'getExplore'
    | 'updateProgress'
    | 'storeToolCall'
    | 'storeToolResults'
>;

export type DiscoverFieldsAgentArgs = {
    input: DiscoverFieldsInput;
    availableExplores: Explore[];
    model: LanguageModel;
    callOptions: CallSettings;
    providerOptions: AiAgentArgs['providerOptions'];
    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    toolDescriptionMaxChars: number;
    abortSignal?: AbortSignal;
    promptUuid: string;
    parentToolCallId: string;
    telemetry: Pick<
        AiAgentArgs,
        | 'agentSettings'
        | 'threadUuid'
        | 'promptUuid'
        | 'organizationId'
        | 'userId'
        | 'telemetryEnabled'
        | 'model'
    >;
};

export type DiscoverFieldsSubagentTools = {
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
};

export type DiscoverFieldsAgentHandle = {
    stream: StreamTextResult<
        DiscoverFieldsSubagentTools,
        typeof discoverFieldsSelectionOutput
    >;
    /**
     * Waits for any in-flight `storeToolCall` writes triggered by the
     * subagent's `onChunk` to settle. Call this after the stream has
     * been fully consumed but before yielding the final tool output, so
     * the parent's `tool-result` row never commits before its children.
     */
    flushPersistence: () => Promise<void>;
};

export const runDiscoverFieldsAgent = (
    args: DiscoverFieldsAgentArgs,
    dependencies: DiscoverFieldsAgentDependencies,
): DiscoverFieldsAgentHandle => {
    const findExplores = getFindExplores({
        fieldSearchSize: args.findExploresFieldSearchSize,
        findExplores: dependencies.findExplores,
        updateProgress: dependencies.updateProgress,
        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
    });

    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        findFields: dependencies.findFields,
        updateProgress: dependencies.updateProgress,
        pageSize: args.findFieldsPageSize,
        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
    });

    const messages: ModelMessage[] = [
        getDiscoverFieldsSystemPrompt({
            availableExplores: args.availableExplores,
            agentInstruction: args.input.agentInstruction,
        }),
        {
            role: 'user',
            content: args.input.userQuery,
        },
    ];

    const inflightWrites: Array<Promise<void>> = [];

    const stream = streamText({
        model: args.model,
        ...args.callOptions,
        providerOptions: args.providerOptions,
        tools: { findExplores, findFields },
        toolChoice: 'auto',
        stopWhen: stepCountIs(SUBAGENT_STEP_CAP),
        output: discoverFieldsSelectionOutput,
        messages,
        abortSignal: args.abortSignal,
        experimental_context: new AgentContext(args.availableExplores),
        experimental_transform: smoothStream({
            delayInMs: 40,
            chunking: 'line',
        }),
        experimental_telemetry: getAgentTelemetryConfig(
            'discoverFieldsSubagent',
            args.telemetry,
            'agent-subtask',
        ),
        onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-call') {
                if (!isSubagentPersistedToolName(chunk.toolName)) return;
                inflightWrites.push(
                    dependencies
                        .storeToolCall({
                            promptUuid: args.promptUuid,
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName,
                            toolArgs: getStoreableToolArgs(chunk.input),
                            parentToolCallId: args.parentToolCallId,
                        })
                        .catch((err) => {
                            Logger.error(
                                '[DiscoverFieldsSubagent] storeToolCall failed',
                                err,
                            );
                        }),
                );
                return;
            }
            if (chunk.type === 'tool-result') {
                if (!isSubagentPersistedToolName(chunk.toolName)) return;
                const output = persistedToolOutputSchema.safeParse(
                    chunk.output,
                );
                if (!output.success) {
                    Logger.error(
                        '[DiscoverFieldsSubagent] tool output failed persistence schema validation',
                        output.error,
                    );
                    return;
                }

                inflightWrites.push(
                    dependencies
                        .storeToolResults([
                            {
                                promptUuid: args.promptUuid,
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                result: output.data.result,
                                metadata: output.data.metadata,
                            },
                        ])
                        .catch((err) => {
                            Logger.error(
                                '[DiscoverFieldsSubagent] storeToolResults failed',
                                err,
                            );
                        }),
                );
            }
        },
    });

    return {
        stream,
        flushPersistence: async () => {
            await Promise.allSettled(inflightWrites);
        },
    };
};
