import type { BaseOutputMetadata, Explore } from '@lightdash/common';
import {
    hasToolCall,
    smoothStream,
    stepCountIs,
    streamText,
    type CallSettings,
    type LanguageModel,
    type ModelMessage,
    type StreamTextResult,
} from 'ai';
import Logger from '../../../../../logging/logger';
import { getFindExplores } from '../../tools/findExplores';
import { getFindFields } from '../../tools/findFields';
import { getListExplores } from '../../tools/listExplores';
import { getListFields } from '../../tools/listFields';
import { getSubmitDiscoverFieldsResult } from '../../tools/submitDiscoverFieldsResult';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import { DiscoverFieldsInput } from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 50;

export type DiscoverFieldsAgentDependencies = Pick<
    AiAgentDependencies,
    | 'findExplores'
    | 'findFields'
    | 'getExplore'
    | 'listExplores'
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
    findFieldsPageSize: number;
    abortSignal?: AbortSignal;
    promptUuid: string;
    parentToolCallId: string;
    telemetry: Pick<
        AiAgentArgs,
        | 'agentSettings'
        | 'threadUuid'
        | 'promptUuid'
        | 'telemetryEnabled'
        | 'model'
    >;
};

export type DiscoverFieldsSubagentTools = {
    listExplores: ReturnType<typeof getListExplores>;
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
    listFields: ReturnType<typeof getListFields>;
    submitResult: ReturnType<typeof getSubmitDiscoverFieldsResult>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

type PersistableToolMetadata = BaseOutputMetadata & Record<string, unknown>;

type PersistableToolResult = {
    result: string;
    metadata: PersistableToolMetadata;
};

const isPersistableToolMetadata = (
    metadata: unknown,
): metadata is PersistableToolMetadata =>
    isRecord(metadata) &&
    (metadata.status === 'success' || metadata.status === 'error');

const hasPersistableToolResult = (
    output: unknown,
): output is PersistableToolResult =>
    isRecord(output) &&
    typeof output.result === 'string' &&
    isPersistableToolMetadata(output.metadata);

const toPersistedToolResult = (output: unknown): PersistableToolResult => {
    if (!hasPersistableToolResult(output)) {
        throw new Error(
            'Discovery subagent tool output must include a string result and success/error metadata.',
        );
    }

    return {
        result: output.result,
        metadata: output.metadata,
    };
};

export type DiscoverFieldsAgentHandle = {
    stream: StreamTextResult<DiscoverFieldsSubagentTools, never>;
    flushPersistence: () => Promise<void>;
};

export const runDiscoverFieldsAgent = (
    args: DiscoverFieldsAgentArgs,
    dependencies: DiscoverFieldsAgentDependencies,
): DiscoverFieldsAgentHandle => {
    const listExplores = getListExplores({
        listExplores: dependencies.listExplores,
    });

    const findExplores = getFindExplores({
        findExplores: dependencies.findExplores,
        updateProgress: dependencies.updateProgress,
    });

    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        findFields: dependencies.findFields,
        updateProgress: dependencies.updateProgress,
        pageSize: args.findFieldsPageSize,
    });

    const listFields = getListFields({
        getExplore: dependencies.getExplore,
    });

    const submitResult = getSubmitDiscoverFieldsResult();

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
        tools: {
            listExplores,
            findExplores,
            listFields,
            findFields,
            submitResult,
        },
        toolChoice: 'auto',
        stopWhen: [hasToolCall('submitResult'), stepCountIs(SUBAGENT_STEP_CAP)],
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
        ),
        onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-call') {
                inflightWrites.push(
                    dependencies
                        .storeToolCall({
                            promptUuid: args.promptUuid,
                            toolCallId: chunk.toolCallId,
                            toolName: chunk.toolName,
                            toolArgs: (chunk.input as object) ?? {},
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
                const output = toPersistedToolResult(chunk.output);
                inflightWrites.push(
                    dependencies
                        .storeToolResults([
                            {
                                promptUuid: args.promptUuid,
                                toolCallId: chunk.toolCallId,
                                toolName: chunk.toolName,
                                result: output.result,
                                metadata: output.metadata,
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
        /**
         * Waits for in-flight subagent persistence writes to settle. Call this
         * after the stream has been fully consumed but before yielding the
         * final parent tool output, so the parent's result row never commits
         * before its children.
         */
        flushPersistence: async () => {
            await Promise.allSettled(inflightWrites);
        },
    };
};
