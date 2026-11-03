import {
    QuerySourceType,
    type Explore,
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
    QUERY_SHAPE_CHECK,
    queryReviewNote,
    type ReviewableMetricQuery,
} from './queryChecks';

export { EMPTY_QUERY_GUIDANCE, preferFilterValueHints } from './emptyResults';

export type QueryReviewPlan =
    | {
          kind: 'semantic';
          query: ReviewableMetricQuery;
          parameters?: ParametersValuesMap | null;
          timezone?: string | null;
      }
    | { kind: 'sql'; sql: string; limit: number }
    | { kind: 'composer'; queries: SourceQuery[]; terminalNodeId: string };

export type QueryResultShape = {
    rowCount: number;
    columns: string[];
    rows: Record<string, unknown>[];
};

export type QueryReviewer = (
    plan: QueryReviewPlan,
    result?:
        | { emptyResult: true; review: string }
        // Settles when execution does; null when there is no result to judge.
        | { terminal: Promise<QueryResultShape | null> },
) => Promise<string>;

const SHAPE_SAMPLE_ROWS = 10;
const SHAPE_CELL_CHARS = 100;
const SHAPE_TIMEOUT_MS = 2_000;

const truncateCell = (value: unknown): unknown =>
    typeof value === 'string' && value.length > SHAPE_CELL_CHARS
        ? `${value.slice(0, SHAPE_CELL_CHARS)}…`
        : value;

const checkResultShape = async ({
    decisions,
    question,
    conversation,
    plan,
    terminal,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    question: string;
    conversation?: AgentDecisionContext;
    plan: QueryReviewPlan;
    terminal: Promise<QueryResultShape | null>;
}): Promise<string[]> => {
    const shape = await terminal.catch(() => null);
    if (!shape || shape.rowCount === 0) return [];
    const [instructions, hint] = QUERY_SHAPE_CHECK;
    const answers = await decisions.evaluate({
        operation: 'query-result-shape',
        state: {
            question,
            conversation,
            plan,
            result: {
                rowCount: shape.rowCount,
                columns: shape.columns,
                sampleRows: shape.rows
                    .slice(0, SHAPE_SAMPLE_ROWS)
                    .map((row) =>
                        Object.fromEntries(
                            shape.columns.map((column) => [
                                column,
                                truncateCell(row[column]),
                            ]),
                        ),
                    ),
            },
        },
        questions: { shape: { type: 'noul', instructions } },
        timeoutMs: SHAPE_TIMEOUT_MS,
    });
    return (decisionProbability(answers?.shape) ?? 0) >=
        QUERY_INTENT_ADVICE_THRESHOLD
        ? [hint]
        : [];
};

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
        if (result && 'emptyResult' in result)
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
            if (plan.kind === 'composer') {
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
            const [answers, shapeIssues] = await Promise.all([
                decisions.evaluate({
                    operation: 'query-plan-intent',
                    state: { question, conversation, plan, semanticSources },
                    questions,
                }),
                plan.kind === 'composer' && result && 'terminal' in result
                    ? checkResultShape({
                          decisions,
                          question,
                          conversation,
                          plan,
                          terminal: result.terminal,
                      }).catch(() => [])
                    : [],
            ]);
            return queryReviewNote([
                ...Object.entries(QUERY_INTENT_CHECKS).flatMap(
                    ([key, [, hint]]) =>
                        (decisionProbability(answers?.[key]) ?? 0) >=
                        QUERY_INTENT_ADVICE_THRESHOLD
                            ? [hint]
                            : [],
                ),
                ...shapeIssues,
            ]);
        } catch {
            return '';
        }
    };
