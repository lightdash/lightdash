import { createOpenAI } from '@ai-sdk/openai';
import { EmbeddingModel } from 'ai';
import { DEFAULT_OPENAI_BASE_URL } from '../../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../../config/parseConfig';

export const getOpenAIEmbeddingModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
): EmbeddingModel => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || DEFAULT_OPENAI_BASE_URL,
        headers: config.customHeaders,
    });

    return openai.embedding(config.embeddingModelName);
};
