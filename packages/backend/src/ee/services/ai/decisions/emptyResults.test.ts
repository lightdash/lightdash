import { DimensionType, FilterOperator, type Explore } from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { diagnoseEmptyResult, EMPTY_QUERY_GUIDANCE } from './emptyResults';
import { createQueryReviewer, type QueryReviewPlan } from './queryReview';

const explore: Explore = {
    ...validExplore,
    tables: {
        ...validExplore.tables,
        a: {
            ...validExplore.tables.a,
            dimensions: {
                ...validExplore.tables.a.dimensions,
                order_date: {
                    ...validExplore.tables.a.dimensions.dim1,
                    name: 'order_date',
                    label: 'Order date',
                    type: DimensionType.DATE,
                },
            },
        },
    },
};
const plan: QueryReviewPlan = {
    kind: 'semantic',
    query: { ...metricQueryMock, filters: {} },
};
const choice = (value: string, confidence = 0.99): DecisionAnswers[string] => ({
    type: 'choice',
    choice: value,
    confidence,
    probabilities: { [value]: 1 },
});
const setup = (cause: string, extra: DecisionAnswers = {}) => {
    const answers: DecisionAnswers = {
        cause: choice(cause),
        mismatchSupported: {
            type: 'noul',
            noul: cause === 'empty_scope' ? 0 : 0.99,
        },
        completeScopeMatch: { type: 'noul', noul: 0.99 },
        timeScope: { type: 'noul', noul: 0 },
        ...extra,
    };
    const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
            Response.json({ model: 'test', answers }),
        );
    const decisions = new AiDecisionClient(
        { apiKey: 'test', model: 'test', timeoutMs: 100 },
        request,
    );
    return {
        decisions,
        request,
        args: {
            decisions,
            question: 'Count orders by region',
            explores: [explore],
            plan,
        },
    };
};
const datePlan = (end: string): QueryReviewPlan => ({
    kind: 'semantic',
    query: {
        ...metricQueryMock,
        dimensions: ['a_order_date'],
        filters: {
            dimensions: {
                id: 'root',
                and: [
                    {
                        id: 'date',
                        target: { fieldId: 'a_order_date' },
                        operator: FilterOperator.IN_BETWEEN,
                        values: ['2024-02-01', end],
                    },
                ],
            },
        },
    },
});
const dateAnswers: DecisionAnswers = {
    datePeriod: choice('0'),
    dateField: choice('a_order_date'),
    dateScopeInDefinitions: { type: 'noul', noul: 0 },
    timeScope: { type: 'noul', noul: 1 },
};

describe('evidence-supported empty query diagnosis', () => {
    it.each(['filter_value', 'parameter_state', 'source'])(
        'returns bounded advice for an independently supported %s mismatch',
        async (cause) => {
            const { args, request } = setup(cause);
            const diagnosedPlan: QueryReviewPlan = {
                kind: 'semantic',
                query: {
                    ...metricQueryMock,
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'region',
                                    target: { fieldId: 'a_dim1' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['APAC'],
                                },
                            ],
                        },
                    },
                },
                parameters: { region: 'APAC' },
            };
            const original = structuredClone(diagnosedPlan);
            const result = await diagnoseEmptyResult({
                ...args,
                plan: diagnosedPlan,
            });
            expect(result).toContain('Possible empty-result cause:');
            expect(result).not.toContain(
                'No rows matched the requested scope.',
            );
            expect(diagnosedPlan).toEqual(original);
            expect(request).toHaveBeenCalledOnce();
            expect(
                JSON.parse(String(request.mock.calls[0][1]?.body)).state
                    .rowCount,
            ).toBe(0);
        },
    );
    it.each(['filter_value', 'parameter_state', 'source'])(
        'does not accept a cause choice without independent mismatch evidence (%s)',
        async (cause) => {
            const { args } = setup(cause, {
                mismatchSupported: { type: 'noul', noul: 0.8 },
            });
            expect(await diagnoseEmptyResult(args)).toBe(EMPTY_QUERY_GUIDANCE);
        },
    );
    it.each(['filter_value', 'parameter_state'])(
        'cannot blame a nonexistent binding (%s)',
        async (cause) => {
            const { args } = setup(cause);
            expect(await diagnoseEmptyResult(args)).toBe(EMPTY_QUERY_GUIDANCE);
        },
    );
    it.each(['unknown', 'invented'])('abstains on %s', async (cause) => {
        const { args } = setup(cause);
        expect(await diagnoseEmptyResult(args)).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('keeps advice when a decision is uncertain or unavailable', async () => {
        const { args, request } = setup('source', {
            cause: choice('source', 0.94),
        });
        const review = ' Query/question review: check grain.';
        expect(await diagnoseEmptyResult({ ...args, review })).toBe(
            EMPTY_QUERY_GUIDANCE + review,
        );
        request.mockRejectedValue(new Error('offline'));
        expect(await diagnoseEmptyResult({ ...args, review })).toBe(
            EMPTY_QUERY_GUIDANCE + review,
        );
    });
    it('reports only the scoped result when complete semantic alignment is supported', async () => {
        const { args } = setup('empty_scope');
        const result = await diagnoseEmptyResult(args);
        expect(result).toContain('No rows matched the requested scope.');
        expect(result).toContain('do not rerun the unchanged query');
        expect(result).toContain(
            'Do not claim the underlying dataset is empty.',
        );
        expect(result).toContain('Continue any other analyses');
    });
    it('rejects contradictory positive and negative scope decisions', async () => {
        const { args } = setup('empty_scope', {
            mismatchSupported: { type: 'noul', noul: 0.99 },
        });
        expect(await diagnoseEmptyResult(args)).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('does not trust a negative time classifier over explicit date evidence', async () => {
        const { args } = setup('empty_scope', {
            ...dateAnswers,
            timeScope: { type: 'noul', noul: 0 },
        });
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-28'),
            }),
        ).toContain('compared in code');
    });
    it('does not let an empty-scope choice override a known review concern', async () => {
        const { args } = setup('empty_scope');
        const review = ' Query/question review: missing requested condition.';
        expect(await diagnoseEmptyResult({ ...args, review })).toBe(
            EMPTY_QUERY_GUIDANCE + review,
        );
    });
    it('requires stronger independent alignment for an empty-scope verdict', async () => {
        const { args } = setup('empty_scope', {
            completeScopeMatch: { type: 'noul', noul: 0.95 },
        });
        expect(await diagnoseEmptyResult(args)).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('abstains on an unresolved time scope', async () => {
        const { args } = setup('empty_scope', {
            timeScope: { type: 'noul', noul: 1 },
        });
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders yesterday',
            }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('requires code to match a requested calendar period before concluding scoped emptiness', async () => {
        const { args } = setup('empty_scope', dateAnswers);
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-29'),
            }),
        ).toContain('No rows matched the requested scope.');
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-28'),
            }),
        ).toContain('compared in code');
    });
    it('surfaces a code-proven date mismatch even if the cause selector abstains', async () => {
        const { args } = setup('unknown', dateAnswers);
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-28'),
            }),
        ).toContain('compared in code');
    });
    it('requires a code-verified date mismatch for date-scope advice', async () => {
        const { args } = setup('date_scope', dateAnswers);
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-28'),
            }),
        ).toContain('compared in code');
        expect(
            await diagnoseEmptyResult({
                ...args,
                question: 'Orders in February 2024',
                plan: datePlan('2024-02-29'),
            }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('does not infer empty-scope correctness from opaque SQL or absent field definitions', async () => {
        const { args } = setup('empty_scope');
        expect(
            await diagnoseEmptyResult({
                ...args,
                plan: {
                    kind: 'sql',
                    sql: 'select * from events where false',
                    limit: 100,
                },
            }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
        expect(
            await diagnoseEmptyResult({
                ...args,
                plan: {
                    kind: 'semantic',
                    query: { ...metricQueryMock, metrics: ['unknown_metric'] },
                },
            }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
    });
    it('passes whole composer plans to mismatch diagnosis without executing them', async () => {
        const { args, request } = setup('source');
        const composer = {
            kind: 'composer' as const,
            queries: [],
            terminalNodeId: 'final',
        };
        await diagnoseEmptyResult({ ...args, plan: composer });
        expect(
            JSON.parse(String(request.mock.calls[0][1]?.body)).state
                .executedPlan,
        ).toEqual(composer);
    });
    it('skips decisions when the request context was truncated', async () => {
        const { args, request } = setup('empty_scope');
        expect(
            await diagnoseEmptyResult({
                ...args,
                conversation: {
                    messages: [],
                    instruction: null,
                    compactionSummary: null,
                    incomplete: true,
                },
            }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
        expect(
            await diagnoseEmptyResult({ ...args, question: 'x'.repeat(8001) }),
        ).toBe(EMPTY_QUERY_GUIDANCE);
        expect(request).not.toHaveBeenCalled();
    });
    it('uses the same optional reviewer for empty results with the actual executed parameters', async () => {
        const { decisions, request } = setup('parameter_state');
        const reviewer = createQueryReviewer({
            decisions,
            question: 'Use region EMEA',
            explores: [explore],
        });
        const actual = { ...plan, parameters: { region: 'APAC' } };
        expect(
            await reviewer(actual, { emptyResult: true, review: '' }),
        ).toContain('parameter state');
        expect(
            JSON.parse(String(request.mock.calls[0][1]?.body)).state
                .executedPlan.parameters,
        ).toEqual({ region: 'APAC' });
    });
});
