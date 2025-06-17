import { assertUnreachable } from '@lightdash/common';
import { LanguageModelV1 } from 'ai';

import { AiAgentProvider, AiAgentProviderConfig } from '../types/aiAgent';
import { getAnthropicModel } from './anthropic-claude';
import { getOpenaiGptmodel } from './openai-gpt';

export const getAiAgentModel = <P extends AiAgentProvider = AiAgentProvider>(
    provider: P,
    modelName: string,
    providerConfig: AiAgentProviderConfig<P>,
): LanguageModelV1 => {
    switch (provider) {
        case 'openai':
            if (!providerConfig[provider]) {
                throw new Error('OpenAI provider config not found');
            }

            return getOpenaiGptmodel(modelName, providerConfig[provider]);
        case 'anthropic':
            if (!providerConfig[provider]) {
                throw new Error('Anthropic provider config not found');
            }

            return getAnthropicModel(modelName, providerConfig[provider]);
        default:
            return assertUnreachable(
                provider,
                `Unsupported AI Agent provider: ${provider}`,
            );
    }
};
