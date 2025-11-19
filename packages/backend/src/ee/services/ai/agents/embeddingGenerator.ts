import { ParameterError } from '@lightdash/common';
import { embed, EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getBedrockEmbeddingModel } from '../models/bedrock';
import { getOpenAIEmbeddingModel } from '../models/openai-embedding';

const EMBEDDING_DIMENSIONS = 1536;

function getEmbeddingModelConfig(config: LightdashConfig): {
    model: EmbeddingModel<string>;
    provider: string;
    modelName: string;
} {
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

    throw new ParameterError('No valid embedding provider configuration found');
}

export async function generateEmbedding(
    text: string,
    config: LightdashConfig,
    metadata: Record<string, string> = {},
): Promise<{
    embedding: number[];
    provider: string;
    modelName: string;
}> {
    const { model, provider, modelName } = getEmbeddingModelConfig(config);

    let { embedding } = await embed({
        model,
        value: text.trim(),
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
