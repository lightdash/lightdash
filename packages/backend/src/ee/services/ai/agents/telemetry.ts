import type { AiAgentArgs } from '../types/aiAgent';

/**
 * Builds an `experimental_telemetry` config for an agent-level
 * generateText/streamText call.
 *
 * Passing distinct `functionId`s — e.g. `generateAgentResponse`,
 * `streamAgentResponse`, `discoverFieldsSubagent` — lets observability
 * stacks separate parent vs. subagent latency, token usage, and step
 * counts. The metadata pins each call back to the agent/thread/prompt for
 * cross-referencing with persisted tool calls.
 */
export const getAgentTelemetryConfig = (
    functionId: string,
    {
        agentSettings,
        threadUuid,
        promptUuid,
        telemetryEnabled,
    }: Pick<
        AiAgentArgs,
        'agentSettings' | 'threadUuid' | 'promptUuid' | 'telemetryEnabled'
    >,
) =>
    ({
        functionId,
        isEnabled: telemetryEnabled,
        recordInputs: telemetryEnabled,
        recordOutputs: telemetryEnabled,
        metadata: {
            agentUuid: agentSettings.uuid,
            threadUuid,
            promptUuid,
        },
    }) as const;
