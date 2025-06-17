import { assertUnreachable, ParameterError } from '@lightdash/common';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getOpenaiGptmodel } from './openai-gpt';

export const getModel = (config: LightdashConfig['ai']['copilot']) => {
    switch (config.defaultProvider) {
        case 'openai': {
            const openaiConfig = config.providers.openai;
            if (!openaiConfig) {
                throw new ParameterError('OpenAI configuration is required');
            }
            return getOpenaiGptmodel(openaiConfig);
        }
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }
            return getAzureGpt41Model(azureConfig);
        }
        case 'anthropic': {
            const anthropicConfig = config.providers.anthropic;
            if (!anthropicConfig) {
                throw new ParameterError('Anthropic configuration is required');
            }
            return getAnthropicModel(anthropicConfig);
        }
        default:
            return assertUnreachable(
                config.defaultProvider,
                'Invalid provider',
            );
    }
};
