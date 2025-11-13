import { assertUnreachable } from '@lightdash/common';
import { generateObject, LanguageModel } from 'ai';
import { JSONDiff, Score } from 'autoevals';
import { z } from 'zod';
import { defaultAgentOptions } from '../agents/agentV2';
import { getOpenaiGptmodel } from '../models/openai-gpt';

export const factualityScores = {
    A: 0.4,
    B: 0.6,
    C: 1,
    D: 0,
    E: 0.9,
} as const;

export type FactualityResponse = {
    answer: 'A' | 'B' | 'C' | 'D' | 'E';
    rationale: string;
};

export const meetsFactualityThreshold = (
    answerScore: FactualityResponse['answer'],
    requiredScore: FactualityResponse['answer'] = 'A',
): boolean => factualityScores[answerScore] >= factualityScores[requiredScore];

export type JsonDiffResponse = Score;

export type ContextRelevancyResponse = {
    score: number;
    reason: string;
};

export type RunQueryEfficiencyResponse = {
    score: number;
    runQueryCount: number;
};

export const calculateRunQueryEfficiencyScore = (
    runQueryCount: number,
): number => {
    if (runQueryCount === 0) {
        return 1;
    }
    return 1 / 2 ** (runQueryCount - 1);
};

type LlmJudgeResultBase = {
    query: string;
    response: string;
    expectedAnswer?: string;
    timestamp: string;
    passed: boolean;
};

export type LlmJudgeResult =
    | (LlmJudgeResultBase & {
          scorerType: 'factuality';
          result: FactualityResponse;
      })
    | (LlmJudgeResultBase & {
          scorerType: 'jsonDiff';
          result: JsonDiffResponse;
      })
    | (LlmJudgeResultBase & {
          scorerType: 'contextRelevancy';
          context: string[];
          result: ContextRelevancyResponse;
      })
    | (LlmJudgeResultBase & {
          scorerType: 'runQueryEfficiency';
          result: RunQueryEfficiencyResponse;
      });

type BaseLlmAsJudgeParams = {
    query: string;
    response: string;
    expectedAnswer?: string;
    context?: string[];
    judge: Exclude<LanguageModel, string>;
    callOptions: ReturnType<typeof getOpenaiGptmodel>['callOptions'];
    contextRelevancyThreshold?: number; // Threshold for context relevancy (default 0.7)
    factualityThreshold?: 'A' | 'B' | 'C' | 'D' | 'E'; // Minimum acceptable factuality score (default 'A' = subset or better)
    jsonDiffThreshold?: number; // Threshold for JSON diff score (default 0.9)
};

// Function overloads for type safety
export async function llmAsAJudge(
    params: BaseLlmAsJudgeParams & { scorerType: 'factuality' },
): Promise<{
    result: FactualityResponse;
    meta: LlmJudgeResult;
}>;

export async function llmAsAJudge(
    params: BaseLlmAsJudgeParams & { scorerType: 'jsonDiff' },
): Promise<{
    result: JsonDiffResponse;
    meta: LlmJudgeResult;
}>;

export async function llmAsAJudge(
    params: BaseLlmAsJudgeParams & { scorerType: 'contextRelevancy' },
): Promise<{
    result: ContextRelevancyResponse;
    meta: LlmJudgeResult;
}>;

/**
 * Use LLM-as-judge to evaluate agent responses
 * @param query The user's original query
 * @param response The agent's response
 * @param expectedAnswer The expected/reference answer
 * @param judge Your configured AI model to be the judge (e.g., openai('gpt-4'))
 * @param scorerType The type of evaluation to perform
 * @param contextRelevancyThreshold Minimum score for context relevancy (0-1, default 0.7)
 * @param factualityThreshold Minimum acceptable factuality score (default 'A')
 */
export async function llmAsAJudge({
    query,
    response,
    expectedAnswer,
    context,
    judge,
    callOptions,
    scorerType,
    contextRelevancyThreshold = 0.7,
    factualityThreshold = 'A',
    jsonDiffThreshold = 0.9,
}: BaseLlmAsJudgeParams & {
    scorerType: 'factuality' | 'jsonDiff' | 'contextRelevancy';
}): Promise<{
    result: FactualityResponse | JsonDiffResponse | ContextRelevancyResponse;
    meta: LlmJudgeResult;
}> {
    switch (scorerType) {
        case 'jsonDiff': {
            if (!expectedAnswer) {
                throw new Error(
                    'expectedAnswer is required for jsonDiff scorer',
                );
            }
            const diff = await JSONDiff({
                output: response,
                expected: expectedAnswer,
            });

            // Consider passed if score is >= 0.9
            const passed = (diff.score ?? 0) >= jsonDiffThreshold;

            return {
                result: diff,
                meta: {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    result: diff,
                    timestamp: new Date().toISOString(),
                    passed,
                },
            };
        }

        case 'factuality': {
            if (!expectedAnswer) {
                throw new Error(
                    'expectedAnswer is required for factuality scorer',
                );
            }

            // Build context section if context is provided (e.g., tool results with data)
            const contextSection =
                context && context.length > 0
                    ? `
      ************
      [Context]: 
      ${context.join('\n')}
      ************`
                    : '';

            const { object } = await generateObject({
                model: judge,
                ...defaultAgentOptions,
                ...callOptions,
                schema: z.object({
                    answer: z
                        .enum(['A', 'B', 'C', 'D', 'E'])
                        .describe('Your selection.'),
                    rationale: z
                        .string()
                        .describe(
                            'Why you chose this answer. Be very detailed.',
                        ),
                }),
                /**
                 * Prompt taken from autoevals:
                 *
                 * {@link https://github.com/braintrustdata/autoevals/blob/5aa20a0a9eb8fc9e07e9e5722ebf71c68d082f32/templates/factuality.yaml}
                 */
                prompt: `
      You are comparing a submitted answer to an expert answer on a given question. Here is the data:
      [BEGIN DATA]
      ************
      [Question]: ${query}
      ************
      [Expert]: ${expectedAnswer}
      ************
      [Submission]: ${response}
      ************${contextSection}
      [END DATA]
${
    context && context.length > 0
        ? `
      Additional Context: The above context includes query results. 
      Use this information to verify if the submitted answer correctly references or includes the data from these results.
      When comparing factual content, check if numbers, metrics, or data points in the submission match those in the tool results.
`
        : ''
}
      Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
      The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
      (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
      (B) The submitted answer is a superset of the expert answer and is fully consistent with it.
      (C) The submitted answer contains all the same details as the expert answer.
      (D) There is a disagreement between the submitted answer and the expert answer.
      (E) The answers differ, but these differences don't matter from the perspective of factuality.
      `,
            });

            const factualityResult = {
                answer: object.answer,
                rationale: object.rationale,
            };

            const passed = meetsFactualityThreshold(
                object.answer,
                factualityThreshold,
            );

            return {
                result: factualityResult,
                meta: {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    result: factualityResult,
                    timestamp: new Date().toISOString(),
                    passed,
                },
            };
        }

        case 'contextRelevancy': {
            if (!context) {
                throw new Error('context is required for contextRelevancy');
            }

            const { object } = await generateObject({
                model: judge,
                ...defaultAgentOptions,
                ...callOptions,
                schema: z.object({
                    score: z
                        .number()
                        .min(0)
                        .max(1)
                        .describe('Relevancy score between 0 and 1'),
                    reason: z
                        .string()
                        .describe('Explanation for the relevancy score'),
                }),
                prompt: `
You are evaluating the relevancy of context used to answer a query.

[BEGIN DATA]
************
[Query]: ${query}
************
[Context]:
${context.map((c, i) => `${i + 1}. ${c}`).join('\n')}
************
[Response]: ${response}
************
[END DATA]

Evaluate how relevant the provided context is to answering the query. Consider:
1. Does the context contain information needed to answer the query?
2. Is the context directly related to the query topic?
3. How much of the context is actually useful for answering the query?

Provide a relevancy score between 0 (not relevant at all) and 1 (highly relevant), and explain your reasoning.
                `,
            });

            const contextResult = {
                score: object.score,
                reason: object.reason,
            };

            const passed = object.score >= contextRelevancyThreshold;

            return {
                result: contextResult,
                meta: {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    context,
                    result: contextResult,
                    timestamp: new Date().toISOString(),
                    passed,
                },
            };
        }

        default:
            return assertUnreachable(scorerType, 'Unsupported scorer type');
    }
}
