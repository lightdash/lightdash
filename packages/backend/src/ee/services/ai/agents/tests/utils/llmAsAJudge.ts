import { generateObject } from 'ai';
import { z } from 'zod';
import { getOpenaiGptmodel } from '../../../models/openai-gpt';

const ResponseEvaluationSchema = z.object({
    relevance: z
        .number()
        .min(1)
        .max(5)
        .describe(
            'How relevant is the response to the query? 1=not relevant, 5=perfectly relevant',
        ),
    accuracy: z
        .number()
        .min(1)
        .max(5)
        .describe(
            'How accurate is the information provided? 1=inaccurate, 5=completely accurate',
        ),
    completeness: z
        .number()
        .min(1)
        .max(5)
        .describe(
            'How complete is the response? 1=missing key info, 5=comprehensive',
        ),
    reasoning: z.string().describe('Brief explanation of the scores'),
});

export type ResponseEvaluation = z.infer<typeof ResponseEvaluationSchema>;

/**
 * Use LLM-as-judge to evaluate agent responses
 * @param query The user's original query
 * @param response The agent's response
 * @param model Your configured AI model (e.g., openai('gpt-4'))
 */
export async function llmAsAJudge(
    query: string,
    response: string,
    model: ReturnType<typeof getOpenaiGptmodel>,
): Promise<ResponseEvaluation> {
    const { object } = await generateObject({
        model,
        schema: ResponseEvaluationSchema,
        prompt: `You are evaluating an AI assistant's response about data analytics/BI in Lightdash.
                User Query: "${query}"

                Assistant Response: "${response}"

                Evaluate the response on three dimensions:
                1. Relevance - Does it answer what was asked?
                2. Accuracy - Is the information correct and trustworthy?
                3. Completeness - Does it cover all aspects of the query?

                Be strict but fair in your evaluation.`,
    });

    return object;
}
