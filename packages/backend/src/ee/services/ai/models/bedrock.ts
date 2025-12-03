import {
    AmazonBedrockProvider,
    createAmazonBedrock,
} from '@ai-sdk/amazon-bedrock';
import type { EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel } from './types';

const PROVIDER = 'bedrock';

export const getBedrockProvider = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): AmazonBedrockProvider =>
    'apiKey' in config
        ? createAmazonBedrock({
              apiKey: config.apiKey,
              ...(config.region ? { region: config.region } : {}),
          })
        : createAmazonBedrock({
              region: config.region,
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
              ...(config.sessionToken
                  ? { sessionToken: config.sessionToken }
                  : {}),
          });

export const getBedrockModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
    preset: ModelPreset<'bedrock'>,
): AiModel<typeof PROVIDER> => {
    const bedrock = getBedrockProvider(config);
    /** @ref https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock#accessing-bedrock */
    const model = bedrock(`${config.region}.${preset.modelId}`);

    return {
        model,
        callOptions: preset.callOptions,
        providerOptions: preset.providerOptions
            ? { [PROVIDER]: preset.providerOptions }
            : undefined,
    };
};

export const getBedrockEmbeddingModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): EmbeddingModel<string> => {
    const bedrock = getBedrockProvider(config);
    return bedrock.embedding(config.embeddingModelName);
};
