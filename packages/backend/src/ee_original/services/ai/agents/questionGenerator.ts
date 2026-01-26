import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';

const QUESTION_MAX_LENGTH_CHARS = 200;
const QuestionSchema = z.object({
    question: z
        .string()
        .min(1, 'Question must not be empty')
        .max(
            QUESTION_MAX_LENGTH_CHARS,
            `Question must be ${QUESTION_MAX_LENGTH_CHARS} characters or less`,
        )
        .describe('A natural question a user might ask about this artifact'),
});

export type GeneratedQuestion = z.infer<typeof QuestionSchema>;

export async function generateArtifactQuestion(
    model: LanguageModel,
    title: string | null,
    description: string | null,
    metadata: Record<string, string> = {},
): Promise<string> {
    const result = await generateObject({
        model,
        schema: QuestionSchema,
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant that creates natural questions users might ask to get the data shown in an artifact.

Generate a concise question (maximum ${QUESTION_MAX_LENGTH_CHARS} characters) that a user might ask to obtain this data or insight.

Good examples:
- "What were the total orders in the last 30 days?"
- "How has revenue changed over the last 12 months?"
- "What is the average shipping cost by fulfillment center for express promo orders?"
- "Which 5 shipping methods have the highest percentage of orders?"

The question should be natural, specific, and actionable - something a user would type into a search or chat interface.`,
            },
            {
                role: 'user',
                content: `Please create a question based on this artifact:
Title: ${title || 'N/A'}
Description: ${description || 'N/A'}`,
            },
        ],
        temperature: 0.3,
        experimental_telemetry: {
            functionId: 'generateArtifactQuestion',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
    });

    return result.object.question;
}
