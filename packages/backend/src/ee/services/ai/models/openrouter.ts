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
        extraBody: {
            /** @ref https://openrouter.ai/docs/features/provider-routing */
            provider: {
                data_collection: 'deny',
                require_parameters: true,
                ...(config.allowedProviders.length > 0
                    ? { only: config.allowedProviders }
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
