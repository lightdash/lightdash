import { generateText } from 'ai';
import { GeneratorModelOptions } from '../models/types';

export async function generateScheduledSavedContentReport(
    modelOptions: GeneratorModelOptions,
    { prompt, content }: { prompt: string; content: string },
): Promise<string> {
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        messages: [
            {
                role: 'system',
                content: `You write the message body for a scheduled delivery of ${content}. Be concise and factual, and follow the user's instructions about what to report.`,
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
    });

    return result.text;
}
