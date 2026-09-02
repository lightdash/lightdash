import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel, ProviderOptionsMap } from './types';

const PROVIDER = 'google';

const enforceStatelessInteractions: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => ({
        ...params,
        providerOptions: {
            ...params.providerOptions,
            google: {
                ...params.providerOptions?.google,
                store: false,
            },
        },
    }),
};

export const withGoogleInteractionsDefaults = (
    model: Parameters<typeof wrapLanguageModel>[0]['model'],
) =>
    wrapLanguageModel({
        model,
        middleware: enforceStatelessInteractions,
    });

export const getGoogleGeminiModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['google']
    >,
    preset: ModelPreset<'google'>,
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        headers: config.customHeaders,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const reasoningEnabled =
        options?.enableReasoning === true && preset.supportsReasoning;
    const providerOptions = {
        ...(preset.providerOptions ?? {}),
        store: false,
        thinkingLevel: reasoningEnabled ? 'medium' : 'low',
        ...(reasoningEnabled ? { thinkingSummaries: 'auto' } : {}),
    } satisfies ProviderOptionsMap[typeof PROVIDER];

    return {
        model: withGoogleInteractionsDefaults(
            google.interactions(preset.modelId),
        ),
        callOptions: preset.callOptions,
        providerOptions: { [PROVIDER]: providerOptions },
    };
};
