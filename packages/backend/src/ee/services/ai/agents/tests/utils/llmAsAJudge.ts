import { assertUnreachable } from '@lightdash/common';
import { ContextRelevancyMetric } from '@mastra/evals/llm';
import { generateObject } from 'ai';
import { JSONDiff, Score } from 'autoevals';
import { z } from 'zod';
import { getOpenaiGptmodel } from '../../../models/openai-gpt';
import { defaultAgentOptions } from '../../agent';

export const factualityScores = {
    A: 0.4,
    B: 0.6,
    C: 1,
    D: 0,
    E: 1,
} as const;

export type FactualityResponse = {
    answer: 'A' | 'B' | 'C' | 'D' | 'E';
    rationale: string;
};

export type JsonDiffResponse = Score;

export type ContextRelevancyResponse = {
    score: number;
    reason: string;
};

type LlmJudgeResultBase = {
    query: string;
    response: string;
    expectedAnswer?: string;
    timestamp: string;
    passed?: boolean;
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
      });

type BaseLlmAsJudgeParams = {
    query: string;
    response: string;
    expectedAnswer?: string;
    context?: string[];
    model: ReturnType<typeof getOpenaiGptmodel>;
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
 * @param model Your configured AI model (e.g., openai('gpt-4'))
 * @param scorerType The type of evaluation to perform
 */
export async function llmAsAJudge({
    query,
    response,
    expectedAnswer,
    context,
    model,
    scorerType,
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

            return {
                result: diff,
                meta: {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    result: diff,
                    timestamp: new Date().toISOString(),
                },
            };
        }

        case 'factuality': {
            if (!expectedAnswer) {
                throw new Error(
                    'expectedAnswer is required for factuality scorer',
                );
            }
            const { object } = await generateObject({
                model,
                ...defaultAgentOptions,
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
      ************
      [END DATA]

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

            return {
                result: factualityResult,
                meta: {
                    scorerType,
                    query,
                    response,
                    expectedAnswer,
                    result: factualityResult,
                    timestamp: new Date().toISOString(),
                },
            };
        }

        case 'contextRelevancy': {
            if (!context) {
                throw new Error('context is required for contextRelevancy');
            }
            const metric = new ContextRelevancyMetric(model, {
                context,
            });
            const result = await metric.measure(query, response);

            const contextResult = {
                score: result.score,
                reason: result.info.reason,
            };

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
                },
            };
        }

        default:
            return assertUnreachable(scorerType, 'Unsupported scorer type');
    }
}
