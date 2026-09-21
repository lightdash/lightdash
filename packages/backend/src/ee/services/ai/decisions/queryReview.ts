import {
    isMergeMetricSource,
    QuerySourceType,
    type Explore,
    type MergeQuery,
    type ParametersValuesMap,
    type SourceQuery,
} from '@lightdash/common';
import type { AgentDecisionContext } from './agentQuestion';
import {
    AiDecisionClient,
    decisionProbability,
    type DecisionQuestion,
} from './AiDecisionClient';
import { diagnoseEmptyResult } from './emptyResults';
import {
    checkQueryIntent,
    describeSemanticQuery,
    QUERY_INTENT_ADVICE_THRESHOLD,
    QUERY_INTENT_CHECKS,
    queryReviewNote,
    type ReviewableMetricQuery,
} from './queryChecks';

export { EMPTY_QUERY_GUIDANCE } from './emptyResults';

export type QueryReviewPlan =
    | {
          kind: 'semantic';
          query: ReviewableMetricQuery;
          parameters?: ParametersValuesMap | null;
          timezone?: string | null;
      }
    | {
          kind: 'merge';
          query: MergeQuery;
          parameters?: ParametersValuesMap | null;
      }
    | { kind: 'sql'; sql: string; limit: number }
    | { kind: 'composer'; queries: SourceQuery[]; terminalNodeId: string };

export type QueryReviewer = (
    plan: QueryReviewPlan,
    result?: { emptyResult: true; review: string },
) => Promise<string>;

export const createQueryReviewer =
    ({
        decisions,
        question,
        conversation,
        explores,
    }: {
        decisions: Pick<AiDecisionClient, 'evaluate'>;
        question: string;
        conversation?: AgentDecisionContext;
        explores: Explore[];
    }): QueryReviewer =>
    async (plan, result) => {
        if (result?.emptyResult)
            return diagnoseEmptyResult({
                decisions,
                question,
                conversation,
                explores,
                plan,
                review: result.review,
            });
        if (!question.trim()) return '';
        try {
            if (plan.kind === 'semantic') {
                const explore = explores.find(
                    (candidate) => candidate.name === plan.query.exploreName,
                );
                if (!explore) return '';
                return queryReviewNote(
                    await checkQueryIntent({
                        decisions,
                        question,
                        conversation,
                        explore,
                        query: {
                            queryConfig: {
                                ...plan.query,
                                parameters:
                                    plan.parameters === undefined
                                        ? plan.query.parameters
                                        : plan.parameters,
                                timezone:
                                    plan.timezone === undefined
                                        ? plan.query.timezone
                                        : plan.timezone,
                            },
                        },
                    }),
                );
            }
            const sources: {
                id: string | null;
                query: ReviewableMetricQuery;
            }[] = [];
            if (plan.kind === 'merge') {
                plan.query.sources
                    .filter(isMergeMetricSource)
                    .forEach((source) =>
                        sources.push({
                            id: source.id,
                            query: source.metricQuery,
                        }),
                    );
            } else if (plan.kind === 'composer') {
                plan.queries.forEach((source) => {
                    if (source.sourceType === QuerySourceType.SEMANTIC_LAYER)
                        sources.push({
                            id: source.nodeId ?? null,
                            query: {
                                ...source,
                                filters: source.filters ?? {},
                                sorts: source.sorts ?? [],
                                limit: source.limit ?? null,
                            },
                        });
                });
            }
            const semanticSources = sources.flatMap((source) => {
                const explore = explores.find(
                    (candidate) => candidate.name === source.query.exploreName,
                );
                return explore
                    ? [
                          {
                              id: source.id,
                              ...describeSemanticQuery(source.query, explore),
                          },
                      ]
                    : [];
            });
            const questions: Record<string, DecisionQuestion> =
                Object.fromEntries(
                    Object.entries(QUERY_INTENT_CHECKS).map(
                        ([key, [instructions]]) => [
                            key,
                            {
                                type: 'noul',
                                instructions: `${instructions} Assess the whole executed plan and its terminal output, not each intermediate source independently. A condition or grouping may be applied in a later node. Referenced prior results and unknown SQL tables may contain restrictions or definitions not visible here: missing metadata is not evidence of a mismatch. Do not calculate date bounds or numeric results.`,
                            },
                        ],
                    ),
                );
            const answers = await decisions.evaluate({
                operation: 'query-plan-intent',
                state: { question, conversation, plan, semanticSources },
                questions,
            });
            if (!answers) return '';
            return queryReviewNote(
                Object.entries(QUERY_INTENT_CHECKS).flatMap(([key, [, hint]]) =>
                    (decisionProbability(answers[key]) ?? 0) >=
                    QUERY_INTENT_ADVICE_THRESHOLD
                        ? [hint]
                        : [],
                ),
            );
        } catch {
            return '';
        }
    };
