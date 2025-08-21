import { CoreMessage, generateObject, LanguageModelV1 } from 'ai';
import { z } from 'zod';

const TitleSchema = z.object({
    title: z
        .string()
        .min(1, 'Title must not be empty')
        .max(60, 'Title must be 60 characters or less')
        .describe('A concise, descriptive title for the conversation thread'),
});

export type GeneratedTitle = z.infer<typeof TitleSchema>;

export async function generateThreadTitle(
    model: LanguageModelV1,
    messages: CoreMessage[],
): Promise<string> {
    const result = await generateObject({
        model,
        schema: TitleSchema,
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant that creates short, descriptive titles for conversations.

Generate a concise title (maximum 60 characters) that summarizes the main topic or question being discussed.

Good examples:
- "Order data analysis"
- "Sales performance review" 
- "Customer insights report"
- "Revenue trends by region"
- "Dashboard creation help"
- "Chart formatting issues"

The title should be clear, specific, and helpful for someone browsing a list of conversations.`,
            },
            {
                role: 'user',
                content:
                    'Please create a title for this conversation based on the messages.',
            },
            ...messages,
        ],
        maxTokens: 30,
        temperature: 0.3,
    });

    return result.object.title;
}
