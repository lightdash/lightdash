import { Explore } from '@lightdash/common';
import {
    generateText,
    Output,
    stepCountIs,
    type CallSettings,
    type LanguageModel,
    type ModelMessage,
} from 'ai';
import { getFindExplores } from '../../tools/findExplores';
import { getFindFields } from '../../tools/findFields';
import type { AiAgentArgs, AiAgentDependencies } from '../../types/aiAgent';
import { AgentContext } from '../../utils/AgentContext';
import { getAgentTelemetryConfig } from '../telemetry';
import {
    DiscoverFieldsInput,
    DiscoverFieldsResult,
    discoverFieldsResultSchema,
} from './schema';
import { getDiscoverFieldsSystemPrompt } from './systemPrompt';

const SUBAGENT_STEP_CAP = 10;

export type DiscoverFieldsAgentDependencies = Pick<
    AiAgentDependencies,
    | 'findExplores'
    | 'findFields'
    | 'getExplore'
    | 'updateProgress'
    | 'storeToolCall'
>;

export type DiscoverFieldsAgentArgs = {
    input: DiscoverFieldsInput;
    availableExplores: Explore[];
    model: LanguageModel;
    callOptions: CallSettings;
    providerOptions: AiAgentArgs['providerOptions'];
    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    /** Prompt the parent agent is responding to — used to scope persisted
     * subagent tool calls. */
    promptUuid: string;
    /** Parent `discoverFields` tool call id — set on every persisted
     * subagent tool call so the UI can nest them. */
    parentToolCallId: string;
    /** Subset of parent AiAgentArgs needed to emit subagent-specific
     * telemetry (functionId = `discoverFieldsSubagent`). */
    telemetry: Pick<
        AiAgentArgs,
        'agentSettings' | 'threadUuid' | 'promptUuid' | 'telemetryEnabled'
    >;
};

export type DiscoverFieldsTraceEntry = {
    toolCallId: string;
    toolName: 'findExplores' | 'findFields';
    toolArgs: unknown;
};

export type DiscoverFieldsRunResult = {
    handoff: DiscoverFieldsResult;
    trace: DiscoverFieldsTraceEntry[];
};

/**
 * Kicks off the subagent as a streaming run.
 *
 * Returns the StreamText result so the caller (the discoverFields tool's
 * async-generator execute) can pipe the subagent's UI messages back through
 * the parent agent's stream — that's what surfaces live "Searching
 * explores…" / "Searching for fields…" feedback in the chat while the
 * subagent works. The caller awaits the final structured output and steps
 * after the stream completes.
 */
/**
 * Anthropic rejects `thinking` + forced `tool_choice` together, and the AI
 * SDK forces tool choice to "any" whenever `experimental_output` is set
 * (which we need for schema-enforced structured output). So we strip
 * thinking from the inherited providerOptions specifically for the subagent
 * call. The parent agent keeps thinking enabled — it's only the subagent
 * that can't run with both.
 */
const stripAnthropicThinking = (
    providerOptions: DiscoverFieldsAgentArgs['providerOptions'],
): DiscoverFieldsAgentArgs['providerOptions'] => {
    if (!providerOptions) return providerOptions;
    const { anthropic } = providerOptions as {
        anthropic?: Record<string, unknown>;
    };
    if (!anthropic || !('thinking' in anthropic)) return providerOptions;
    const withoutThinking = Object.fromEntries(
        Object.entries(anthropic).filter(([k]) => k !== 'thinking'),
    );
    return {
        ...providerOptions,
        anthropic: withoutThinking,
    } as DiscoverFieldsAgentArgs['providerOptions'];
};

export const runDiscoverFieldsAgent = async (
    args: DiscoverFieldsAgentArgs,
    dependencies: DiscoverFieldsAgentDependencies,
): Promise<DiscoverFieldsRunResult> => {
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

    const result = await generateText({
        model: args.model,
        ...args.callOptions,
        providerOptions: stripAnthropicThinking(args.providerOptions),
        tools: { findExplores, findFields },
        toolChoice: 'auto',
        stopWhen: stepCountIs(SUBAGENT_STEP_CAP),
        messages,
        experimental_context: new AgentContext(args.availableExplores),
        experimental_output: Output.object({
            schema: discoverFieldsResultSchema,
        }),
        experimental_telemetry: getAgentTelemetryConfig(
            'discoverFieldsSubagent',
            args.telemetry,
        ),
    });

    const trace: DiscoverFieldsTraceEntry[] = result.steps.flatMap((step) =>
        step.toolCalls
            .filter(
                (
                    tc,
                ): tc is typeof tc & {
                    toolName: 'findExplores' | 'findFields';
                } =>
                    tc.toolName === 'findExplores' ||
                    tc.toolName === 'findFields',
            )
            .map((tc) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                toolArgs: tc.input,
            })),
    );

    // Persist the subagent's internal tool calls under the parent
    // discoverFields call so the UI can nest them. Errors are non-fatal —
    // the structured handoff is more important than the trace.
    await Promise.allSettled(
        trace.map((entry) =>
            dependencies.storeToolCall({
                promptUuid: args.promptUuid,
                toolCallId: entry.toolCallId,
                toolName: entry.toolName,
                toolArgs: (entry.toolArgs as object) ?? {},
                parentToolCallId: args.parentToolCallId,
            }),
        ),
    );

    return {
        handoff: result.experimental_output.handoff,
        trace,
    };
};
