import { assertUnreachable, type Explore } from '@lightdash/common';
import {
    generateText,
    stepCountIs,
    type CallSettings,
    type GenerateTextOnStepFinishCallback,
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

export type AutopilotStopReason = 'end_turn' | 'step_cap' | 'timeout' | 'error';

type AnyAiModel<P = AiProvider> = P extends AiProvider ? AiModel<P> : never;

export type AutopilotAgentRunResult = {
    slackSummary: string | null;
    stepCount: number;
    stopReason: AutopilotStopReason;
    error: string | null;
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
    onStepFinish?: GenerateTextOnStepFinishCallback<ToolSet>;
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
    onStepFinish,
}: RunAutopilotAgentArgs): Promise<AutopilotAgentRunResult> => {
    let slackSummary: string | null = null;
    let stepCount = 0;
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(new Error('Autopilot timed out')),
        timeoutMs,
    );
    const { signal: abortSignal } = controller;
    const timeoutResult = (): AutopilotAgentRunResult => ({
        slackSummary,
        stepCount,
        stopReason: 'timeout',
        error: `Autopilot timed out after ${Math.round(timeoutMs / 1000)} seconds at step ${stepCount}`,
    });
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
            onStepFinish: async (step) => {
                stepCount += 1;
                emitAiUsage(telemetry, languageModelUsageToTokens(step.usage));
                await onStepFinish?.(step);
                step.toolCalls.forEach((toolCall) => {
                    Logger.info(`[Autopilot] Tool call: ${toolCall.toolName}`);
                });
            },
        });

        if (abortSignal.aborted) return timeoutResult();
        switch (result.finishReason) {
            case 'stop':
                return {
                    slackSummary,
                    stepCount,
                    stopReason: 'end_turn',
                    error: null,
                };
            case 'tool-calls':
                return {
                    slackSummary,
                    stepCount,
                    stopReason: 'step_cap',
                    error: `Autopilot stopped after ${stepCount} steps before finishing its checklist`,
                };
            case 'length':
            case 'content-filter':
            case 'error':
            case 'other':
                return {
                    slackSummary,
                    stepCount,
                    stopReason: 'error',
                    error: `Autopilot did not finish its checklist (provider finish reason: ${result.finishReason})`,
                };
            default:
                return assertUnreachable(
                    result.finishReason,
                    'Unknown Autopilot finish reason',
                );
        }
    } catch (error) {
        if (abortSignal.aborted) return timeoutResult();
        return {
            slackSummary,
            stepCount,
            stopReason: 'error',
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown provider error',
        };
    } finally {
        clearTimeout(timer);
    }
};
