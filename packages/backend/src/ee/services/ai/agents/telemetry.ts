import type { AiAgentArgs } from '../types/aiAgent';
import { AiCallFeature, getAiCallTelemetry } from '../utils/aiCallTelemetry';

export const getAiAgentModelName = (model: AiAgentArgs['model']) =>
    typeof model === 'string' ? model : model.modelId;

/**
 * Builds an `experimental_telemetry` config for an agent-level
 * generateText/streamText call.
 *
 * Passing distinct `functionId`s — e.g. `generateAgentResponse`,
 * `streamAgentResponse`, `discoverFieldsSubagent` — lets observability
 * stacks separate parent vs. subagent latency, token usage, and step
 * counts. The metadata pins each call to the org/project/agent/thread/prompt
 * for cost attribution and cross-referencing with persisted tool calls.
 *
 * Spans always emit; `telemetryEnabled` only controls whether prompt/response
 * content is recorded (it can contain user data) — see `getAiCallTelemetry`.
 */
export const getAgentTelemetryConfig = (
    functionId: string,
    {
        agentSettings,
        threadUuid,
        promptUuid,
        organizationId,
        userId,
        telemetryEnabled,
        model,
    }: Pick<
        AiAgentArgs,
        | 'agentSettings'
        | 'threadUuid'
        | 'promptUuid'
        | 'organizationId'
        | 'userId'
        | 'telemetryEnabled'
        | 'model'
    >,
    feature: AiCallFeature = 'agent',
) =>
    getAiCallTelemetry({
        functionId,
        feature,
        organizationUuid: organizationId,
        projectUuid: agentSettings.projectUuid,
        agentUuid: agentSettings.uuid,
        threadUuid,
        promptUuid,
        userUuid: userId,
        model: getAiAgentModelName(model),
        recordIO: telemetryEnabled,
    });
