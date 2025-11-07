import { ParameterError } from '@lightdash/common';
import { embed } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getOpenAIEmbeddingModel } from '../models/openai-embedding';

export async function generateEmbedding(
    text: string,
    config: LightdashConfig,
    metadata: Record<string, string> = {},
): Promise<number[]> {
    const openaiConfig = config.ai.copilot?.providers?.openai;
    if (!openaiConfig) {
        throw new ParameterError(
            'OpenAI config not found for embedding generation',
        );
    }

    const model = getOpenAIEmbeddingModel(openaiConfig);
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

    return embedding;
}
