import { createOpenAI } from '@ai-sdk/openai';
import { DEFAULT_OPENAI_BASE_URL } from '../../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
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
        apiKey: config.apiKey,
        baseURL: config.baseUrl || DEFAULT_OPENAI_BASE_URL,
        headers: config.customHeaders,
    });
    const { supportsReasoning, modelId } = preset;

    const model = openai(modelId);
    const extendedReasoningEnabled =
        options?.enableReasoning === true && supportsReasoning;
    const { reasoningEffort: presetReasoningEffort, ...presetProviderOptions } =
        preset.providerOptions ?? {};
    const reasoningProviderOptions = supportsReasoning
        ? ({
              reasoningEffort:
                  presetReasoningEffort ??
                  (extendedReasoningEnabled ? 'medium' : 'low'),
              ...(extendedReasoningEnabled && {
                  // Request a summary so extended reasoning reaches the client.
                  reasoningSummary: 'auto',
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
                ...(config.zeroDataRetention &&
                    supportsReasoning && {
                        store: false,
                        include: ['reasoning.encrypted_content'],
                    }),
            },
        },
    };
};
