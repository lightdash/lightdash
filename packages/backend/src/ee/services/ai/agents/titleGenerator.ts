import { generateObject, ModelMessage } from 'ai';
import { z } from 'zod';
import { GeneratorModelOptions } from '../models/types';

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

/**
 * Extracts a fallback title from the conversation messages when AI title
 * generation fails. Uses the first user message text, truncated at a word
 * boundary if it exceeds the max length. Falls back to "New conversation"
 * if no user message with string content is found.
 */
export function getFallbackTitle(messages: ModelMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === 'user');

    if (!firstUserMessage || typeof firstUserMessage.content !== 'string') {
        return 'New conversation';
    }

    const content = firstUserMessage.content.trim();
    if (!content) {
        return 'New conversation';
    }

    if (content.length <= TITLE_MAX_LENGTH_CHARS) {
        return content;
    }

    // Truncate at the last word boundary before TITLE_MAX_LENGTH_CHARS - 3 chars
    // (reserve space for "...")
    const truncated = content.slice(0, TITLE_MAX_LENGTH_CHARS - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    const cutPoint = lastSpace > 0 ? lastSpace : TITLE_MAX_LENGTH_CHARS - 3;
    return `${content.slice(0, cutPoint)}...`;
}

export async function generateThreadTitle(
    modelOptions: GeneratorModelOptions,
    messages: ModelMessage[],
): Promise<string> {
    const result = await generateObject({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
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
    });

    return result.object.title;
}
