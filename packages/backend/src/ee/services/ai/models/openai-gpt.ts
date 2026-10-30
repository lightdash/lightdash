import { createOpenAI } from '@ai-sdk/openai';
import { DEFAULT_OPENAI_BASE_URL } from '../../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../../config/parseConfig';
import {
    getReasoningProviderOptions,
    withChatCompletionsDefaults,
} from './chatCompletions';
import { ModelPreset } from './presets';
import {
    createRequestSizeGuardedFetch,
    IMAGE_MODEL_GATEWAY_REQUEST_MAX_BYTES,
    IMAGE_MODEL_REQUEST_MAX_BYTES,
} from './requestSizeGuard';
import { AiModel, ProviderOptionsMap } from './types';

const PROVIDER = 'openai';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
    preset: ModelPreset<'openai'>,
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const openai = createOpenAI({
        fetch: createRequestSizeGuardedFetch(
            config.baseUrl && config.baseUrl !== DEFAULT_OPENAI_BASE_URL
                ? IMAGE_MODEL_GATEWAY_REQUEST_MAX_BYTES
                : IMAGE_MODEL_REQUEST_MAX_BYTES.openai,
        ),
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
                // OpenAI Zero Data Retention (ZDR) organizations do not persist
                // reasoning IDs; return encrypted content for stateless follow-ups.
                // Chat Completions is stateless already and rejects `include`.
                ...(config.zeroDataRetention &&
                    supportsReasoning &&
                    !config.useChatCompletions && {
                        store: false,
                        include: ['reasoning.encrypted_content'],
                    }),
            },
        },
    };
};
