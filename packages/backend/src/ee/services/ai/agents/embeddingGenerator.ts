import { ParameterError } from '@lightdash/common';
import { embed, EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getOpenAIEmbeddingModel } from '../models/openai-embedding';

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

    const { embedding } = await embed({
        model,
        value: text.trim(),
        experimental_telemetry: {
            functionId: 'generateEmbedding',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
    });

    return { embedding, provider, modelName };
}
