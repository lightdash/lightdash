import {
    AmazonBedrockProvider,
    createAmazonBedrock,
} from '@ai-sdk/amazon-bedrock';
import type { EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel } from './types';

const PROVIDER = 'bedrock';

/**
 * Maps AWS region codes to Bedrock cross-region inference profile prefixes.
 * Newer Claude models (3.7+, 4.x) require inference profiles and cannot use direct model IDs.
 * @ref https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
 *
 * @param region - AWS region code (e.g., 'us-east-1', 'eu-west-1', 'ap-northeast-1')
 * @returns The model prefix for cross-region inference ('us', 'eu', or 'apac')
 */
function getBedrockModelPrefix(region: string | undefined): string {
    if (!region) return 'us'; // default to US

    if (region.startsWith('us-')) return 'us';
    if (region.startsWith('eu-')) return 'eu';
    if (region.startsWith('ap-')) return 'apac';

    return 'us'; // default fallback for unknown regions
}

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
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const bedrock = getBedrockProvider(config);
    /** @ref https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock#api-model-ids */
    const modelPrefix = getBedrockModelPrefix(config.region);
    const model = bedrock(`${modelPrefix}.${preset.modelId}`);

    const reasoningEnabled =
        options?.enableReasoning && preset.supportsReasoning;

    return {
        model,
        callOptions: {
            ...preset.callOptions,
            // temperature is not supported when reasoning is enabled
            ...(reasoningEnabled
                ? { temperature: undefined }
                : { temperature: 0.2 }),
        },
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                ...(reasoningEnabled && {
                    reasoningConfig: {
                        type: 'enabled',
                        budgetTokens: 2048,
                    },
                }),
            },
        },
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
