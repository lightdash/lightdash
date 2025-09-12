import { generateObject, LanguageModel, ModelMessage } from 'ai';
import { z } from 'zod';

const TITLE_MAX_LENGTH_CHARS = 60;
const TitleSchema = z.object({
    title: z
        .string()
        .min(1, 'Title must not be empty')
        .max(
            TITLE_MAX_LENGTH_CHARS,
            `Title must be ${TITLE_MAX_LENGTH_CHARS} characters or less`,
        )
        .describe('A concise, descriptive title for the conversation thread'),
});

export type GeneratedTitle = z.infer<typeof TitleSchema>;

export async function generateThreadTitle(
    model: LanguageModel,
    messages: ModelMessage[],
): Promise<string> {
    const result = await generateObject({
        model,
        schema: TitleSchema,
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant that creates short, descriptive titles for conversations.

Generate a concise title (maximum ${TITLE_MAX_LENGTH_CHARS} characters) that summarizes the main topic or question being discussed.

Good examples:
- "Order data analysis for last 30 days"
- "Revenue over last 12 months"
- "Avg shipping cost by center for promo express orders"
- "Top 5 shipping methods by order percentage"

The title should be clear, specific, and helpful for someone browsing a list of conversations.`,
            },
            {
                role: 'user',
                content:
                    'Please create a title for this conversation based on the messages.',
            },
            ...messages,
        ],
        temperature: 0.3,
    });

    return result.object.title;
}
