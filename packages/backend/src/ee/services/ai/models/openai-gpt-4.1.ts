import { createOpenAI } from '@ai-sdk/openai';

export const getOpenaiGpt41model = (apiKey: string) => {
    const openai = createOpenAI({
        apiKey,
        compatibility: 'strict',
    });

    const model = openai('gpt-4.1', {
        structuredOutputs: true,
    });

    return model;
};
