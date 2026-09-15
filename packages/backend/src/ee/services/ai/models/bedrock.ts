import {
    AmazonBedrockProvider,
    createAmazonBedrock,
} from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import {
    ModelPreset,
    ReasoningEffort,
    XHIGH_MAX_OUTPUT_TOKENS,
    XHIGH_THINKING_BUDGET_TOKENS,
} from './presets';
import { AiModel } from './types';

const PROVIDER = 'bedrock';

/**
 * Maps AWS region codes to Bedrock cross-region inference profile prefixes.
 * @ref https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
 */
function getBedrockModelPrefix(
    region: string,
    overridePrefix?: string,
): string {
    if (overridePrefix) return overridePrefix;

    if (region.startsWith('us-')) return 'us';
    if (region.startsWith('eu-')) return 'eu';
    if (region.startsWith('ap-')) return 'apac';
    return 'global';
}

export const getBedrockProvider = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): AmazonBedrockProvider => {
    if ('apiKey' in config) {
        return createAmazonBedrock({
            apiKey: config.apiKey,
            region: config.region,
            ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
            headers: config.customHeaders,
        });
    }
    if ('accessKeyId' in config) {
        return createAmazonBedrock({
            region: config.region,
            ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            headers: config.customHeaders,
            ...(config.sessionToken
                ? { sessionToken: config.sessionToken }
                : {}),
        });
    }
    return createAmazonBedrock({
        region: config.region,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        headers: config.customHeaders,
        credentialProvider: fromNodeProviderChain(),
    });
};

export const getBedrockModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
    preset: ModelPreset<'bedrock'>,
    options?: { enableReasoning?: boolean; reasoningEffort?: ReasoningEffort },
): AiModel<typeof PROVIDER> => {
    const bedrock = getBedrockProvider(config);
    /** @ref https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock#api-model-ids */
    const modelPrefix = getBedrockModelPrefix(
        config.region,
        config.inferenceProfilePrefix,
    );
    const model = bedrock(`${modelPrefix}.${preset.modelId}`);

    const reasoningEnabled =
        options?.enableReasoning && preset.supportsReasoning;

    const reasoningStyle = preset.reasoningStyle ?? 'budget';
    const effort = options?.reasoningEffort ?? 'medium';

    return {
        model,
        callOptions: {
            ...preset.callOptions,
            ...(reasoningEnabled && { temperature: undefined }),
            ...(reasoningEnabled &&
                effort === 'xhigh' && {
                    maxOutputTokens: XHIGH_MAX_OUTPUT_TOKENS,
                }),
        },
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                ...(reasoningEnabled &&
                    (reasoningStyle === 'adaptive'
                        ? {
                              // Claude 4.7+ models reject `budget_tokens` and
                              // require adaptive thinking with an effort level.
                              // @ai-sdk/amazon-bedrock maps this to
                              // `thinking.type: 'adaptive'` + `output_config.effort`
                              // for Anthropic models from 4.0.148+.
                              reasoningConfig: {
                                  type: 'adaptive' as const,
                                  maxReasoningEffort: effort,
                              },
                          }
                        : {
                              reasoningConfig: {
                                  type: 'enabled' as const,
                                  budgetTokens:
                                      effort === 'xhigh'
                                          ? XHIGH_THINKING_BUDGET_TOKENS
                                          : 2048,
                              },
                          })),
            },
        },
    };
};

export const getBedrockEmbeddingModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['bedrock']
    >,
): EmbeddingModel => {
    const bedrock = getBedrockProvider(config);
    return bedrock.embedding(config.embeddingModelName);
};

export { getBedrockModelPrefix };
