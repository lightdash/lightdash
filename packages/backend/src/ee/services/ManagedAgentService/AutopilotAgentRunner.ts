import type { Explore } from '@lightdash/common';
import {
    generateText,
    stepCountIs,
    type CallSettings,
    type LanguageModel,
    type ToolSet,
} from 'ai';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../analytics/aiUsage';
import Logger from '../../../logging/logger';
import type { AiModel, AiProvider } from '../ai/models/types';
import { AgentContext } from '../ai/utils/AgentContext';
import type { getAiCallTelemetry } from '../ai/utils/aiCallTelemetry';
import type { RenderedAutopilotAgent } from './config/agent';
import { buildAutopilotTools, type ExecuteAutopilotTool } from './config/tools';

export type AutopilotStopReason = 'end_turn' | 'step_cap' | 'timeout';

type AnyAiModel<P = AiProvider> = P extends AiProvider ? AiModel<P> : never;

export type AutopilotAgentRunResult = {
    slackSummary: string | null;
    stepCount: number;
    stopReason: AutopilotStopReason;
};

export type RunAutopilotAgentArgs = {
    model: Exclude<LanguageModel, string>;
    callOptions: CallSettings;
    providerOptions: AnyAiModel['providerOptions'];
    agent: RenderedAutopilotAgent;
    dataTools: ToolSet;
    availableExplores: Explore[];
    executeTool: ExecuteAutopilotTool;
    projectName: string;
    maxSteps: number;
    timeoutMs: number;
    telemetry: ReturnType<typeof getAiCallTelemetry>;
};

const MAX_RETRIES = 6;

export const getAutopilotKickoffMessage = (projectName: string) =>
    `Today's date is ${new Date().toISOString().split('T')[0]}. Analyze project "${projectName}". Follow your checklist.`;

// Runs one Autopilot heartbeat as a plain AI SDK tool loop. Tool handlers
// persist their own actions, so a timed-out run still keeps everything it did.
export const runAutopilotAgent = async ({
    model,
    callOptions,
    providerOptions,
    agent,
    dataTools,
    availableExplores,
    executeTool,
    projectName,
    maxSteps,
    timeoutMs,
    telemetry,
}: RunAutopilotAgentArgs): Promise<AutopilotAgentRunResult> => {
    let slackSummary: string | null = null;
    let stepCount = 0;
    const abortSignal = AbortSignal.timeout(timeoutMs);
    const tools: ToolSet = {
        ...dataTools,
        ...buildAutopilotTools({
            definitions: agent.tools,
            executeTool,
            onSlackSummary: (summary) => {
                slackSummary = summary;
            },
        }),
    };

    try {
        const result = await generateText({
            maxRetries: MAX_RETRIES,
            ...callOptions,
            model,
            providerOptions,
            system: agent.system,
            messages: [
                {
                    role: 'user',
                    content: getAutopilotKickoffMessage(projectName),
                },
            ],
            tools,
            toolChoice: 'auto',
            stopWhen: stepCountIs(maxSteps),
            abortSignal,
            experimental_context: new AgentContext(availableExplores),
            experimental_telemetry: telemetry,
            onStepFinish: (step) => {
                stepCount += 1;
                emitAiUsage(telemetry, languageModelUsageToTokens(step.usage));
                step.toolCalls.forEach((toolCall) => {
                    Logger.info(`[Autopilot] Tool call: ${toolCall.toolName}`);
                });
            },
        });

        return {
            slackSummary,
            stepCount,
            stopReason:
                result.finishReason === 'tool-calls' ? 'step_cap' : 'end_turn',
        };
    } catch (error) {
        if (abortSignal.aborted) {
            Logger.warn(
                `[Autopilot] Run timed out after ${timeoutMs}ms at step ${stepCount}`,
            );
            return { slackSummary, stepCount, stopReason: 'timeout' };
        }
        throw error;
    }
};
