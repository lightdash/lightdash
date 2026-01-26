import { ParameterError } from '@lightdash/common';
import { embed, EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAzureProvider } from '../models/azure-openai-gpt-4.1';
import { getBedrockEmbeddingModel } from '../models/bedrock';
import { getOpenAIEmbeddingModel } from '../models/openai-embedding';

const EMBEDDING_DIMENSIONS = 1536;

function getEmbeddingModelConfig(config: LightdashConfig):
    | {
          model: EmbeddingModel<string>;
          provider: string;
          modelName: string;
      }
    | undefined {
    const {
        defaultEmbeddingModelProvider,
        defaultProvider,
        providers: { openai: openaiConfig },
    } = config.ai.copilot;

    const embeddingProvider = defaultEmbeddingModelProvider || defaultProvider;

    if (embeddingProvider === 'openai' && openaiConfig) {
        return {
            model: getOpenAIEmbeddingModel(openaiConfig),
            provider: 'openai',
            modelName: openaiConfig.embeddingModelName,
        };
    }

    const bedrockConfig = config.ai.copilot.providers.bedrock;
    if (embeddingProvider === 'bedrock' && bedrockConfig) {
        return {
            model: getBedrockEmbeddingModel(bedrockConfig),
            provider: 'bedrock',
            modelName: bedrockConfig.embeddingModelName,
        };
    }

    const azureConfig = config.ai.copilot.providers.azure;
    if (embeddingProvider === 'azure' && azureConfig) {
        const azure = getAzureProvider(azureConfig);

        return {
            model: azure.textEmbedding(azureConfig.embeddingDeploymentName),
            provider: 'azure',
            modelName: azureConfig.embeddingDeploymentName,
        };
    }

    return undefined;
}

export async function generateEmbedding(
    text: string,
    config: LightdashConfig,
    metadata: Record<string, string> = {},
): Promise<{
    embedding: number[];
    provider: string;
    modelName: string;
} | null> {
    const trimmedText = text.trim();
    if (!trimmedText) {
        return null;
    }

    const embeddingModelConfig = getEmbeddingModelConfig(config);
    if (!embeddingModelConfig) {
        return null;
    }
    const { model, provider, modelName } = embeddingModelConfig;

    let { embedding } = await embed({
        model,
        value: trimmedText,
        experimental_telemetry: {
            functionId: 'generateEmbedding',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
        // TODO :: provider options to set dimensions
    });

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.warn(
            `Embedding length is not ${EMBEDDING_DIMENSIONS}, padding with zeros`,
        );
        embedding = embedding.concat(
            new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0),
        );
    }

    return { embedding, provider, modelName };
}
