import type { AiAgentDependencies } from '../types/aiAgent';
import { AnswerEvidence, withAnswerEvidence } from './answerEvidence';

const input = {
    queryUuid: 'query-uuid',
    rows: [{ month: 'January', revenue: '100' }],
    rowCount: 1,
    fields: {},
    maxContextRows: 100,
    limit: 100,
    scope: { table: 'orders' },
};

describe('answer evidence', () => {
    it('retains exact values, query identity and row coordinates without changing results', () => {
        const evidence = new AnswerEvidence();
        evidence.record(input);
        expect(evidence.snapshot()[0]).toMatchObject({
            queryUuid: 'query-uuid',
            complete: true,
            cells: [
                {
                    fieldId: 'revenue',
                    rowIndex: 0,
                    coordinates: { month: 'January' },
                    value: { numerator: 100n, denominator: 1n },
                },
                { fieldId: '__ld_returned_row_count', rowIndex: -1 },
            ],
        });
    });

    it.each([
        { limit: 1 },
        { limit: null },
        { maxContextRows: 0 },
        { rowCount: 2 },
        { rows: [{ metric: Number.MAX_SAFE_INTEGER + 1 }] },
        {
            rows: [
                Object.fromEntries(
                    Array.from({ length: 51 }, (_, i) => [`metric${i}`, i]),
                ),
            ],
        },
        {
            rows: [
                Object.fromEntries(
                    Array.from({ length: 7 }, (_, i) => [
                        `dimension${i}`,
                        'value',
                    ]),
                ),
            ],
        },
        { scope: 'a'.repeat(2100) },
        { rows: [{ dimension: 'a'.repeat(100), revenue: 100 }] },
    ])('never certifies incomplete evidence: %j', (overrides) => {
        const evidence = new AnswerEvidence();
        evidence.record({ ...input, ...overrides });
        expect(evidence.snapshot()[0].complete).toBe(false);
    });

    it('bounds retained queries and isolates each invocation', () => {
        const evidence = new AnswerEvidence();
        for (let i = 0; i < 8; i += 1)
            evidence.record({ ...input, queryUuid: `query-${i}` });
        expect(evidence.snapshot()).toHaveLength(6);
        expect(evidence.snapshot()[0].queryUuid).toBe('query-2');
        expect(new AnswerEvidence().snapshot()).toEqual([]);
    });

    it('does not interfere with successful query execution when evidence cannot be serialized', async () => {
        const runAsyncQuery = vi.fn().mockResolvedValue(input);
        const dependencies = {
            runAsyncQuery,
        } as unknown as AiAgentDependencies;
        const evidence = new AnswerEvidence();
        const wrapped = withAnswerEvidence(dependencies, evidence, 100);
        const query = { limit: 100, unsupported: 1n } as unknown as Parameters<
            AiAgentDependencies['runAsyncQuery']
        >[0];
        expect(await wrapped.runAsyncQuery(query)).toBe(input);
        expect(evidence.snapshot()).toEqual([]);
    });

    it('leaves dependencies untouched when disabled', () => {
        const dependencies = {} as AiAgentDependencies;
        expect(withAnswerEvidence(dependencies, undefined, 100)).toBe(
            dependencies,
        );
    });

    it('captures every query family after successful execution without another warehouse call', async () => {
        const runAsyncQuery = vi.fn().mockResolvedValue(input);
        const runAsyncMergeQuery = vi.fn().mockResolvedValue(input);
        const execution = {
            metricQuery: {
                limit: 50,
                filters: {
                    dimensions: {
                        id: 'and',
                        and: [
                            {
                                id: 'region',
                                target: { fieldId: 'orders_region' },
                                operator: 'equals',
                                values: ['EMEA'],
                            },
                        ],
                    },
                },
            },
            usedParametersValues: { region: 'EMEA' },
            resolvedTimezone: 'Europe/London',
        };
        const runSavedChartQuery = vi.fn().mockResolvedValue({
            ...input,
            queryUuid: 'saved-query',
            execution,
        });
        const runSqlJob = vi.fn().mockResolvedValue(input);
        const runComposerQueries = vi
            .fn()
            .mockResolvedValue({ terminal: input });
        const dependencies = {
            runAsyncQuery,
            runAsyncMergeQuery,
            runSavedChartQuery,
            runSqlJob,
            runComposerQueries,
        } as unknown as AiAgentDependencies;
        const evidence = new AnswerEvidence();
        const wrapped = withAnswerEvidence(dependencies, evidence, 100);
        const query = { limit: 100 } as Parameters<
            AiAgentDependencies['runAsyncQuery']
        >[0];
        const merge = { limit: 100 } as Parameters<
            AiAgentDependencies['runAsyncMergeQuery']
        >[0];
        await wrapped.runAsyncQuery(query, [], { region: 'EMEA' });
        await wrapped.runAsyncMergeQuery(merge, { region: 'EMEA' });
        await wrapped.runSavedChartQuery({
            chartUuid: 'chart',
            dashboardSlug: null,
            limit: 100,
        });
        await wrapped.runSqlJob({ sql: 'select 100 as revenue', limit: 100 });
        await wrapped.runComposerQueries({
            queries: [],
            terminalNodeId: 'terminal',
        });
        expect(runAsyncQuery).toHaveBeenCalledExactlyOnceWith(query, [], {
            region: 'EMEA',
        });
        expect(runAsyncMergeQuery).toHaveBeenCalledExactlyOnceWith(merge, {
            region: 'EMEA',
        });
        expect(runSavedChartQuery).toHaveBeenCalledExactlyOnceWith({
            chartUuid: 'chart',
            dashboardSlug: null,
            limit: 100,
        });
        expect(runSqlJob).toHaveBeenCalledExactlyOnceWith({
            sql: 'select 100 as revenue',
            limit: 100,
        });
        expect(runComposerQueries).toHaveBeenCalledExactlyOnceWith({
            queries: [],
            terminalNodeId: 'terminal',
        });
        expect(evidence.snapshot()).toHaveLength(5);
        expect(evidence.snapshot()[0].scope).toContain('EMEA');
        expect(evidence.snapshot()[2].queryUuid).toBe('saved-query');
        expect(evidence.snapshot()[2].scope).toContain(
            JSON.stringify(execution),
        );
        expect(evidence.snapshot()[4].complete).toBe(false);
    });

    it('preserves query failures and records no evidence', async () => {
        const failure = new Error('warehouse unavailable');
        const dependencies = {
            runSqlJob: vi.fn().mockRejectedValue(failure),
        } as unknown as AiAgentDependencies;
        const evidence = new AnswerEvidence();
        await expect(
            withAnswerEvidence(dependencies, evidence, 100).runSqlJob({
                sql: 'select 1',
                limit: 10,
            }),
        ).rejects.toBe(failure);
        expect(evidence.snapshot()).toEqual([]);
    });
});
