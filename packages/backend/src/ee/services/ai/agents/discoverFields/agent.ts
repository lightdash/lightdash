import { AgentToolOutput, Explore } from '@lightdash/common';
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
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../../analytics/aiUsage';
import Logger from '../../../../../logging/logger';
import { getFindExplores } from '../../tools/findExplores';
import { getFindFields } from '../../tools/findFields';
import { getSubmitDiscoverFieldsResult } from '../../tools/submitDiscoverFieldsResult';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import type { DiscoverFieldsInput } from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 50;

const SUBAGENT_PERSISTED_TOOL_NAMES = ['findExplores', 'findFields'] as const;
type SubagentPersistedToolName = (typeof SUBAGENT_PERSISTED_TOOL_NAMES)[number];
const isSubagentPersistedToolName = (
    name: string,
): name is SubagentPersistedToolName =>
    (SUBAGENT_PERSISTED_TOOL_NAMES as readonly string[]).includes(name);

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
        | 'keyManagement'
    >;
};

export type DiscoverFieldsSubagentTools = {
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
    submitResult: ReturnType<typeof getSubmitDiscoverFieldsResult>;
};

export type DiscoverFieldsAgentHandle = {
    stream: StreamTextResult<DiscoverFieldsSubagentTools, never>;
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

    const telemetry = getAgentTelemetryConfig(
        'discoverFieldsSubagent',
        args.telemetry,
        'agent-subtask',
    );
    const stream = streamText({
        model: args.model,
        ...args.callOptions,
        providerOptions: args.providerOptions,
        tools: { findExplores, findFields, submitResult },
        toolChoice: 'auto',
        stopWhen: [hasToolCall('submitResult'), stepCountIs(SUBAGENT_STEP_CAP)],
        messages,
        abortSignal: args.abortSignal,
        experimental_context: new AgentContext(args.availableExplores),
        experimental_transform: smoothStream({
            delayInMs: 40,
            chunking: 'line',
        }),
        experimental_telemetry: telemetry,
        onFinish: ({ totalUsage }) => {
            emitAiUsage(telemetry, languageModelUsageToTokens(totalUsage));
        },
        onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-call') {
                if (!isSubagentPersistedToolName(chunk.toolName)) return;
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
                if (!isSubagentPersistedToolName(chunk.toolName)) return;
                const output = chunk.output as AgentToolOutput;
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
        flushPersistence: async () => {
            await Promise.allSettled(inflightWrites);
        },
    };
};
