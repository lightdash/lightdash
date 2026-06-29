import { generateText } from 'ai';
import { GeneratorModelOptions } from '../models/types';

export async function generateScheduledResourceReport(
    modelOptions: GeneratorModelOptions,
    { prompt, resource }: { prompt: string; resource: string },
): Promise<string> {
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        messages: [
            {
                role: 'system',
                content: `You write the message body for a scheduled delivery of ${resource}. Be concise and factual, and follow the user's instructions about what to report.`,
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
    });

    return result.text;
}
