import { createOpenAI } from '@ai-sdk/openai';
import { EmbeddingModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';

export const getOpenAIEmbeddingModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
): EmbeddingModel<string> => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    return openai.embedding(config.embeddingModelName);
};
