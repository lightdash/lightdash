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
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import { DiscoverFieldsInput, discoverFieldsResultSchema } from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 15;

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
 * Internal tool the subagent must call as its FINAL step. Its inputSchema
 * IS `discoverFieldsResultSchema`, so AI SDK validates the handoff payload
 * at the tool-call boundary — there's no free-form JSON to parse and no
 * fence stripping. If validation fails, the model gets a tool-call error
 * and retries (or hits the step cap). The handoff is then extracted from
 * the tool call's `input` field after the stream completes.
 */
const submitResult = tool({
    description:
        'Submit the final discovery handoff. Call this as your LAST step after deciding the explore + fields (or that the query is ambiguous / has no match). The arguments are returned to the parent agent verbatim.',
    inputSchema: discoverFieldsResultSchema,
    execute: async (input) => input,
});

export type DiscoverFieldsSubagentTools = {
    findExplores: ReturnType<typeof getFindExplores>;
    findFields: ReturnType<typeof getFindFields>;
    submitResult: typeof submitResult;
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
    });

    const findFields = getFindFields({
        getExplore: dependencies.getExplore,
        findFields: dependencies.findFields,
        updateProgress: dependencies.updateProgress,
        pageSize: args.findFieldsPageSize,
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
        tools: { findExplores, findFields, submitResult },
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
