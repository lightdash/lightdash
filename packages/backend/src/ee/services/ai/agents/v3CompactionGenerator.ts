import { AI_AGENT_V3_TOKEN_USAGE_VERSION } from '@lightdash/common';
import { generateText } from 'ai';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { type AiTokenUsageEnvelope } from '../../../database/entities/aiAgentV3';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';
import { V3_COMPACTION_MAX_OUTPUT_TOKENS } from '../v3Compaction';

const SYSTEM_PROMPT = `You are a context summarization assistant. Read the conversation and produce the structured summary requested by the user message.

Do not continue the conversation or answer its questions. Output only the structured summary.`;

export async function generateV3CompactionSummary(
    modelOptions: GeneratorModelOptions,
    serializedInput: string,
): Promise<{
    summary: string;
    tokenUsage: AiTokenUsageEnvelope;
}> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'generateV3CompactionSummary',
        'compaction',
    );
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        maxOutputTokens: V3_COMPACTION_MAX_OUTPUT_TOKENS,
        providerOptions: modelOptions.providerOptions,
        experimental_telemetry: telemetry,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: serializedInput },
        ],
    });
    const usage = languageModelUsageToTokens(result.totalUsage);
    emitAiUsage(telemetry, usage);
    return {
        summary: result.text.trim(),
        tokenUsage: {
            version: AI_AGENT_V3_TOKEN_USAGE_VERSION,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cacheReadTokens,
            // Single-step call: the billed total is also the resident context.
            contextTokens: usage.totalTokens,
        },
    };
}
