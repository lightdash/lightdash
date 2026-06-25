import { AgentToolOutput, Explore } from '@lightdash/common';
import {
    smoothStream,
    stepCountIs,
    streamText,
    tool,
    type CallSettings,
    type LanguageModel,
    type ModelMessage,
    type StreamTextResult,
} from 'ai';
import Logger from '../../../../../logging/logger';
import { getFindExplores } from '../../tools/findExplores';
import { getFindFields } from '../../tools/findFields';
import { getGetFields } from '../../tools/getFields';
import type { ToolOutputFormat } from '../../tools/toolOutputFormat';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import { DiscoverFieldsInput, discoverFieldsSelectionSchemaV2 } from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 15;

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
    outputFormat: ToolOutputFormat;
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

/**
 * Internal tool the subagent must call as its FINAL step. Its V2 inputSchema
 * accepts selectors only (exploreName + fieldIds), so final field/explore
 * objects are rehydrated by the parent from tool/runtime metadata.
 */
const submitResult = tool({
    description:
        'Submit final discovery selectors. Call this as your LAST step. For resolved, pass only exploreName, ordered fieldIds, and rationale; the parent rehydrates exact field/explore details.',
    inputSchema: discoverFieldsSelectionSchemaV2,
    execute: async (input) => input,
});

export type DiscoverFieldsSubagentTools = {
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
    getFields: ReturnType<typeof getGetFields>;
    submitResult: typeof submitResult;
};

const normalizePersistedToolResult = (
    toolName: string,
    output: unknown,
): { result: string; metadata?: Record<string, unknown> | null } => {
    if (toolName === 'submitResult') {
        return {
            result: JSON.stringify(output),
            metadata: { status: 'success' },
        };
    }

    const agentOutput = output as AgentToolOutput;
    return {
        result: agentOutput.result,
        metadata: agentOutput.metadata,
    };
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
        outputFormat: args.outputFormat,
    });

    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        findFields: dependencies.findFields,
        updateProgress: dependencies.updateProgress,
        pageSize: args.findFieldsPageSize,
        outputFormat: args.outputFormat,
    });

    const getFields = getGetFields({
        getExplore: dependencies.getExplore,
        outputFormat: args.outputFormat,
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
        tools: { findExplores, findFields, getFields, submitResult },
        toolChoice: 'auto',
        stopWhen: stepCountIs(SUBAGENT_STEP_CAP),
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
                const output = normalizePersistedToolResult(
                    chunk.toolName,
                    chunk.output,
                );
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
