import { QuerySourceType, type SourceQuery } from '@lightdash/common';
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
    describe('result shape', () => {
        const sqlPipeline: QueryReviewPlan = {
            kind: 'composer',
            queries: [
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'orders',
                    sql: 'SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY 1',
                    limit: 500,
                },
            ],
            terminalNodeId: 'orders',
        };
        const terminal = (rowCount: number) => ({
            terminal: Promise.resolve({
                rowCount,
                columns: ['customer_id', 'n'],
                rows: Array.from(
                    { length: Math.min(rowCount, 50) },
                    (_, i) => ({
                        customer_id: 'x'.repeat(300),
                        n: i,
                        hidden: 'not a terminal column',
                    }),
                ),
            }),
        });
        const shapeCall = (
            evaluate: ReturnType<typeof makeReviewer>['evaluate'],
        ) =>
            evaluate.mock.calls.find(
                ([args]) => args.operation === 'query-result-shape',
            )?.[0];

        it('judges an executed sql terminal by its row count, columns and a truncated sample', async () => {
            const { evaluate, review } = makeReviewer();
            evaluate.mockImplementation(async ({ operation }) => ({
                [operation === 'query-result-shape' ? 'shape' : 'conditions']: {
                    type: 'noul',
                    noul: 0.95,
                },
            }));
            const note = await review(sqlPipeline, terminal(1200));
            expect(note.match(/Query\/question review/g)).toHaveLength(1);
            expect(note).toContain('grouping alone does not apply a filter');
            expect(note).toContain('requested answer shape');
            const call = shapeCall(evaluate);
            expect(call?.timeoutMs).toBe(2_000);
            expect(call?.state).toMatchObject({
                plan: sqlPipeline,
                result: { rowCount: 1200, columns: ['customer_id', 'n'] },
            });
            const { sampleRows } = (
                call?.state as { result: { sampleRows: object[] } }
            ).result;
            expect(sampleRows).toHaveLength(10);
            expect(sampleRows[0]).toEqual({
                customer_id: `${'x'.repeat(100)}…`,
                n: 0,
            });
        });
        it('gives no shape advice below the confidence threshold', async () => {
            const { evaluate, review } = makeReviewer();
            evaluate.mockResolvedValue({
                shape: { type: 'noul', noul: 0.89 },
            });
            expect(await review(sqlPipeline, terminal(3))).toBe('');
            expect(shapeCall(evaluate)).toBeDefined();
        });
        it.each([
            ['an empty result', terminal(0)],
            ['a failed run', { terminal: Promise.resolve(null) }],
        ])('skips the shape check for %s', async (_case, result) => {
            const { evaluate, review } = makeReviewer();
            expect(await review(sqlPipeline, result)).toContain(
                'Query/question review',
            );
            expect(shapeCall(evaluate)).toBeUndefined();
        });
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
