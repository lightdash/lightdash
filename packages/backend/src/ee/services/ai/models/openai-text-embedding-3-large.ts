import { createOpenAI } from '@ai-sdk/openai';

export const getOpenaiTextEmbedding3LargeModel = (apiKey: string) => {
    const openai = createOpenAI({
        apiKey,
        compatibility: 'strict',
    });

    const model = openai.embedding('text-embedding-3-large');

    return model;
};
