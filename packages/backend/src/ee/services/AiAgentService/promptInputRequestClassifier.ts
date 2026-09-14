import type {
    UpdateSlackResponse,
    UpdateWebAppResponse,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../analytics/aiUsage';
import type { AiAgentPromptInputRequestClassifiedEvent } from '../../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import type { AiPromptClassifierNeedsUserInputMetadata } from '../../database/entities/ai';
import {
    resolveReviewJudgeModel,
    type ReviewJudgeConfigResolver,
} from '../ai/reviewJudgeModel';
import {
    getAiCallTelemetry,
    getLanguageModelAttribution,
} from '../ai/utils/aiCallTelemetry';

const PROMPT_INPUT_REQUEST_CLASSIFIER_TIMEOUT_MS = 10_000;
const elapsedMilliseconds = (startedAt: number) =>
    Math.round(performance.now() - startedAt);

export const CLARIFYING_QUESTION_RE =
    /(\?\s*$)|(could you clarify)|(did you mean)|(which (one|of these))|(let me know which)|(what would you like)/i;

export const responseMatchesPromptInputRequestGate = (response: string) =>
    CLARIFYING_QUESTION_RE.test(response);

export const shouldClassifyPromptInputRequestForUpdate = (
    update: UpdateSlackResponse | UpdateWebAppResponse,
) =>
    update.response !== undefined &&
    update.errorMessage === undefined &&
    update.tokenUsage !== undefined;

export const promptInputRequestClassifierOutputSchema = z
    .object({
        needsUserInput: z.boolean(),
        confidence: z.number().min(0).max(1).nullable(),
    })
    .strict();

export type PromptInputRequestClassification = {
    gateFired: boolean;
    classified: boolean | null;
    model: string | null;
    durationMs: number;
    confidence: number | null;
};

type PromptInputRequestClassificationAnalytics = {
    track: (event: AiAgentPromptInputRequestClassifiedEvent) => void;
};

type PromptInputRequestClassificationModel = {
    updatePromptNeedsUserInput: (args: {
        promptUuid: string;
        needsUserInput: boolean;
        metadata: AiPromptClassifierNeedsUserInputMetadata;
    }) => Promise<boolean>;
};

export const classifyPromptInputRequest = async ({
    response,
    organizationUuid,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    orgAiCopilotConfigResolver,
    instanceCopilotConfig,
}: {
    response: string;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    orgAiCopilotConfigResolver: ReviewJudgeConfigResolver;
    instanceCopilotConfig: LightdashConfig['ai']['copilot'];
}): Promise<PromptInputRequestClassification> => {
    const startedAt = performance.now();
    if (!responseMatchesPromptInputRequestGate(response)) {
        return {
            gateFired: false,
            classified: false,
            model: null,
            durationMs: elapsedMilliseconds(startedAt),
            confidence: null,
        };
    }

    let modelName: string | null = null;
    try {
        const model = await resolveReviewJudgeModel({
            organizationUuid,
            orgAiCopilotConfigResolver,
            instanceCopilotConfig,
        });
        const attribution = getLanguageModelAttribution(model.model.model);
        modelName = attribution.model ?? null;
        const telemetry = getAiCallTelemetry({
            functionId: 'aiAgentPromptInputRequestClassifier',
            feature: 'prompt-input-classifier',
            organizationUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            ...attribution,
            keyManagement: model.model.keyManagement,
        });
        const result = await generateObject({
            model: model.model.model,
            maxRetries: 1,
            ...model.model.callOptions,
            providerOptions: model.model.providerOptions,
            experimental_telemetry: telemetry,
            schema: promptInputRequestClassifierOutputSchema,
            abortSignal: AbortSignal.timeout(
                PROMPT_INPUT_REQUEST_CLASSIFIER_TIMEOUT_MS,
            ),
            messages: [
                {
                    role: 'system',
                    content:
                        'Classify the assistant response. Set needsUserInput=true only when it ends with a blocking question whose answer is required before the assistant can continue the current task. Set false for complete answers, rhetorical questions, optional offers, refusals, and invitations for additional work. Return confidence from 0 to 1, or null when unavailable.',
                },
                { role: 'user', content: response },
            ],
        });
        const output = promptInputRequestClassifierOutputSchema.parse(
            result.object,
        );
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));

        return {
            gateFired: true,
            classified: output.needsUserInput,
            model: modelName,
            durationMs: elapsedMilliseconds(startedAt),
            confidence: output.confidence,
        };
    } catch (error) {
        Logger.warn('AI agent prompt input request classification failed', {
            organizationUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            gateFired: true,
            classified: null,
            model: modelName,
            durationMs: elapsedMilliseconds(startedAt),
            confidence: null,
        };
    }
};

export const runPromptInputRequestClassification = async ({
    enabled,
    response,
    organizationUuid,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    userUuid,
    orgAiCopilotConfigResolver,
    instanceCopilotConfig,
    aiAgentModel,
    analytics,
}: {
    enabled: boolean;
    response: string;
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    userUuid: string;
    orgAiCopilotConfigResolver: ReviewJudgeConfigResolver;
    instanceCopilotConfig: LightdashConfig['ai']['copilot'];
    aiAgentModel: PromptInputRequestClassificationModel;
    analytics: PromptInputRequestClassificationAnalytics;
}): Promise<void> => {
    if (!enabled) {
        return;
    }

    const classification = await classifyPromptInputRequest({
        response,
        organizationUuid,
        projectUuid,
        agentUuid,
        threadUuid,
        promptUuid,
        orgAiCopilotConfigResolver,
        instanceCopilotConfig,
    });

    analytics.track({
        event: 'ai_agent.prompt_input_request_classified',
        userId: userUuid,
        properties: {
            organizationUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            gateFired: classification.gateFired,
            classified: classification.classified,
            model: classification.model,
            durationMs: classification.durationMs,
        },
    });

    if (classification.classified === null) {
        return;
    }

    await aiAgentModel.updatePromptNeedsUserInput({
        promptUuid,
        needsUserInput: classification.classified,
        metadata: {
            gate: classification.gateFired ? 'match' : 'no_match',
            model: classification.model,
            durationMs: classification.durationMs,
            confidence: classification.confidence,
        },
    });
};
