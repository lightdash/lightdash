import { createOpenAI } from '@ai-sdk/openai';
import { DEFAULT_OPENAI_BASE_URL } from '../../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../../config/parseConfig';
import {
    getReasoningProviderOptions,
    withChatCompletionsDefaults,
} from './chatCompletions';
import { ModelPreset } from './presets';
import { AiModel, ProviderOptionsMap } from './types';

const PROVIDER = 'openai';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
    preset: ModelPreset<'openai'>,
    options?: { enableReasoning?: boolean; minimalReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || DEFAULT_OPENAI_BASE_URL,
        headers: config.customHeaders,
    });
    const { supportsReasoning, modelId } = preset;

    const model = config.useChatCompletions
        ? withChatCompletionsDefaults(openai.chat(modelId))
        : openai(modelId);
    const extendedReasoningEnabled =
        options?.enableReasoning === true && supportsReasoning;
    const { reasoningEffort: presetReasoningEffort, ...presetProviderOptions } =
        preset.providerOptions ?? {};
    const reasoningProviderOptions = supportsReasoning
        ? ({
              ...getReasoningProviderOptions({
                  useChatCompletions: config.useChatCompletions,
                  responsesEffort: extendedReasoningEnabled ? 'medium' : 'low',
                  includeSummary: extendedReasoningEnabled,
              }),
              // Presets pin the effort their model accepts (gpt-5-mini rejects 'none').
              ...(presetReasoningEffort && {
                  reasoningEffort: presetReasoningEffort,
              }),
          } satisfies ProviderOptionsMap[typeof PROVIDER])
        : undefined;

    return {
        model,
        callOptions: preset.callOptions,
        providerOptions: {
            [PROVIDER]: {
                ...presetProviderOptions,
                // Force sequential tool execution: parallel tool calls in one
                // step can drop some executions (no query, no result), so the
                // agent stalls.
                parallelToolCalls: false,
                ...reasoningProviderOptions,
                // Stored responses make the SDK resend steps by item ID, which
                // ZDR accounts reject. Chat Completions rejects `include`.
                ...(!config.useChatCompletions && {
                    store: false,
                    ...(supportsReasoning && {
                        include: ['reasoning.encrypted_content'],
                    }),
                }),
                ...(!extendedReasoningEnabled &&
                    options?.minimalReasoning &&
                    preset.minimalReasoningProviderOptions),
            },
        },
    };
};
