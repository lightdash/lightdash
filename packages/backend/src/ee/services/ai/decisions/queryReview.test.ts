import {
    MergeJoinType,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from './AiDecisionClient';
import { createQueryReviewer, type QueryReviewPlan } from './queryReview';

const makeReviewer = () => {
    const decisions = new AiDecisionClient({
        apiKey: null,
        model: 'test',
        timeoutMs: 100,
    });
    const evaluate = vi
        .spyOn(decisions, 'evaluate')
        .mockResolvedValue({ conditions: { type: 'noul', noul: 0.99 } });
    return {
        evaluate,
        review: createQueryReviewer({
            decisions,
            question: 'Count completed orders by customer',
            explores: [validExplore],
        }),
    };
};
const metricQuery = { ...metricQueryMock, exploreName: validExplore.name };

describe('reviewing an executed query plan', () => {
    it('reviews the declared attribution predicate, not just the joined table name', async () => {
        const { evaluate } = makeReviewer();
        const explore = {
            ...validExplore,
            joinedTables: [
                {
                    ...validExplore.joinedTables[0],
                    sqlOn: '${orders.customer_id} = ${customers.id}',
                    always: true,
                },
            ],
        };
        const decisions = { evaluate };
        const review = createQueryReviewer({
            decisions,
            question: 'Orders by customer',
            explores: [explore],
        });
        await review({ kind: 'semantic', query: metricQuery });
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            explore: {
                joins: [{ sqlOn: explore.joinedTables[0].sqlOn, always: true }],
            },
        });
    });

    it('preserves embedded execution scope when no separate override is supplied', async () => {
        const { evaluate, review } = makeReviewer();
        const embedded = {
            ...metricQuery,
            parameters: { region: 'EMEA' },
            timezone: 'Europe/London',
        };
        await review({ kind: 'semantic', query: embedded });
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            query: embedded,
        });
        await review({
            kind: 'semantic',
            query: embedded,
            parameters: null,
            timezone: null,
        });
        expect(evaluate.mock.calls[1][0].state).toMatchObject({
            query: { parameters: null, timezone: null },
        });
    });
    it('retains semantic filters, used parameters and timezone without another execution', async () => {
        const { evaluate, review } = makeReviewer();
        const plan: QueryReviewPlan = {
            kind: 'semantic',
            query: metricQuery,
            parameters: { region: 'EMEA' },
            timezone: 'Europe/London',
        };
        const before = structuredClone(plan);
        expect(await review(plan)).toContain(
            'grouping alone does not apply a filter',
        );
        expect(evaluate).toHaveBeenCalledOnce();
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            query: {
                ...metricQuery,
                parameters: { region: 'EMEA' },
                timezone: 'Europe/London',
            },
        });
        expect(plan).toEqual(before);
    });
    it('does not retrieve an explore outside the authorized snapshot', async () => {
        const { evaluate, review } = makeReviewer();
        expect(
            await review({
                kind: 'semantic',
                query: { ...metricQuery, exploreName: 'unauthorized' },
            }),
        ).toBe('');
        expect(evaluate).not.toHaveBeenCalled();
    });
    it('reviews a merge as a whole in one call and retains prior-result references', async () => {
        const { evaluate, review } = makeReviewer();
        const plan: QueryReviewPlan = {
            kind: 'merge',
            query: {
                sources: [
                    { id: 'current', metricQuery },
                    { id: 'prior', queryUuid: 'authorized-query' },
                ],
                joinKey: [],
                joinType: MergeJoinType.FULL,
                tableCalculations: [],
                limit: 100,
            },
            parameters: { region: 'EMEA' },
        };
        const before = structuredClone(plan);
        expect(await review(plan)).toContain('Query/question review');
        expect(evaluate).toHaveBeenCalledOnce();
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            plan,
            semanticSources: [{ id: 'current', query: metricQuery }],
        });
        expect(plan).toEqual(before);
    });
    it('keeps downstream SQL and terminal identity with semantic source metadata', async () => {
        const { evaluate, review } = makeReviewer();
        const queries: SourceQuery[] = [
            {
                ...metricQuery,
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'completed',
                sql: "SELECT * FROM orders WHERE a_status = 'completed'",
                references: ['orders'],
                limit: 50,
            },
        ];
        const plan: QueryReviewPlan = {
            kind: 'composer',
            queries,
            terminalNodeId: 'completed',
        };
        expect(await review(plan)).toContain('Query/question review');
        expect(evaluate).toHaveBeenCalledOnce();
        expect(evaluate.mock.calls[0][0].state).toMatchObject({
            plan,
            semanticSources: [{ id: 'orders' }],
        });
        expect(
            evaluate.mock.calls[0][0].questions.conditions.instructions,
        ).toContain('later node');
        expect(
            evaluate.mock.calls[0][0].questions.conditions.instructions,
        ).toContain('missing metadata is not evidence');
    });
    it('does not ask a semantic model to perform SQL date arithmetic', async () => {
        const { evaluate, review } = makeReviewer();
        await review({
            kind: 'sql',
            sql: 'SELECT * FROM orders LIMIT 10',
            limit: 10,
        });
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toEqual([
            'measure',
            'conditions',
            'grain',
            'time',
            'ranking',
        ]);
        expect(evaluate.mock.calls[0][0].questions.time.instructions).toContain(
            'Do not calculate date bounds',
        );
    });
    it.each([null, { conditions: { type: 'noul' as const, noul: 0.89 } }])(
        'preserves ordinary behavior without a confident mismatch',
        async (answers) => {
            const { evaluate, review } = makeReviewer();
            evaluate.mockResolvedValue(answers);
            expect(
                await review({ kind: 'sql', sql: 'SELECT 1', limit: 10 }),
            ).toBe('');
        },
    );
    it('keeps even an unexpected reviewer exception from breaking query results', async () => {
        const { evaluate, review } = makeReviewer();
        evaluate.mockRejectedValue(new Error('provider offline'));
        expect(await review({ kind: 'sql', sql: 'SELECT 1', limit: 10 })).toBe(
            '',
        );
    });
});
