import type { AiAgentReviewClassifierJudgeOutput } from '@lightdash/common';
import { generateText, Output } from 'ai';
import type { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { defaultAgentOptions } from '../agents/agentV2';
import type { getModel } from '../models';
import type { getAiCallTelemetry } from './aiCallTelemetry';

// The judge's verdict on the turn, without the drafts the follow-up calls add.
export type ReviewTurnFinding = Pick<
    AiAgentReviewClassifierJudgeOutput,
    | 'reviewItem'
    | 'promotionReason'
    | 'targetRefs'
    | 'subcategories'
    | 'recommendation'
    | 'evidenceExcerpts'
>;

export const toReviewTurnFinding = (
    judgeOutput: ReviewTurnFinding,
): ReviewTurnFinding => ({
    reviewItem: judgeOutput.reviewItem,
    promotionReason: judgeOutput.promotionReason,
    targetRefs: judgeOutput.targetRefs,
    subcategories: judgeOutput.subcategories,
    recommendation: judgeOutput.recommendation,
    evidenceExcerpts: judgeOutput.evidenceExcerpts,
});

export type AuthoringMessage = {
    role: 'system' | 'user';
    content: string;
};

export type AuthoringLlmCallArgs = {
    model: ReturnType<typeof getModel>;
    telemetry: ReturnType<typeof getAiCallTelemetry>;
    messages: AuthoringMessage[];
};

export type AuthoringLlmCall = (args: AuthoringLlmCallArgs) => Promise<unknown>;

// Follow-up calls keep their own small schema: merged into the judge schema
// they exceed the provider's strict-structured-output grammar size limit.
export const createAuthoringLlmCall =
    (schema: z.ZodTypeAny): AuthoringLlmCall =>
    async ({ model, telemetry, messages }) => {
        const result = await generateText({
            model: model.model,
            ...defaultAgentOptions,
            ...model.callOptions,
            providerOptions: model.providerOptions,
            ...telemetry,
            output: Output.object({ schema }),
            allowSystemInMessages: true,
            messages,
        });
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
        return result.output;
    };
