import { Explore } from '@lightdash/common';
import {
    hasToolCall,
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
import { getListFields } from '../../tools/listFields';
import { getMcpListExplores } from '../../tools/mcpListExplores';
import { stringifyToolJson } from '../../tools/toolOutputFormat';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import { DiscoverFieldsInput, discoverFieldsSelectionSchemaV2 } from './schema';
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

const submitResult = tool({
    description:
        'Submit final discovery selectors. Call this as your LAST step. For resolved, pass only exploreName, ordered dimensionIds, ordered metricIds, rationale, and uncertainties; use uncertainties: null when selection was straightforward. The parent rehydrates exact field/explore details.',
    inputSchema: discoverFieldsSelectionSchemaV2,
    execute: async (input) => ({
        result: stringifyToolJson(input),
        structuredResult: input,
        metadata: { status: 'success' as const },
    }),
});

export type DiscoverFieldsSubagentTools = {
    listExplores: ReturnType<typeof getMcpListExplores>;
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
    listFields: ReturnType<typeof getListFields>;
    submitResult: typeof submitResult;
};

const isPersistableToolOutput = (
    output: unknown,
): output is {
    result: string;
    metadata?: Record<string, unknown> | null;
} =>
    typeof output === 'object' &&
    output !== null &&
    'result' in output &&
    typeof output.result === 'string';

const normalizePersistedToolResult = (
    toolName: string,
    output: unknown,
): { result: string; metadata?: Record<string, unknown> | null } => {
    if (isPersistableToolOutput(output)) {
        return {
            result: output.result,
            metadata: output.metadata,
        };
    }

    return {
        result: stringifyToolJson(output),
        metadata: toolName === 'submitResult' ? { status: 'success' } : null,
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
    const listExplores = getMcpListExplores({
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
