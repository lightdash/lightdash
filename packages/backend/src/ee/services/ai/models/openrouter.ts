import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'openrouter';

export const getOpenRouterModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openrouter']
    >,
): AiModel<typeof PROVIDER> => {
    /** @ref https://openrouter.ai/docs/community/vercel-ai-sdk */
    const openrouter = createOpenRouter({
        apiKey: `${config.apiKey}`,
        compatibility: 'strict',
        headers: config.customHeaders,
        extraBody: {
            /** @ref https://openrouter.ai/docs/features/provider-routing */
            provider: {
                data_collection: 'deny',
                require_parameters: true,
                // Ranks the upstream pool by latency/throughput/price instead
                // of OpenRouter's default price-weighted load balancing.
                // Providers listed in `order` are still tried first.
                sort: config.sortOrder,
                ...(config.allowedProviders.length > 0
                    ? { only: config.allowedProviders }
                    : {}),
                ...(config.providerOrder.length > 0
                    ? { order: config.providerOrder }
                    : {}),
            },
        },
    });

    const model = openrouter.chat(config.modelName);

    return {
        model,
        callOptions: {
            temperature: 0.2,
        },
        providerOptions: undefined,
    };
};
