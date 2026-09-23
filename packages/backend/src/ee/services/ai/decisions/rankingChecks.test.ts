import { describe, expect, it, vi } from 'vitest';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import { checkQueryIntent, type ReviewableMetricQuery } from './queryChecks';
import { prepareRankingCheck } from './rankingChecks';

const query: ReviewableMetricQuery = {
    exploreName: validExplore.name,
    dimensions: ['b_dim1'],
    metrics: ['a_met1'],
    filters: {},
    sorts: [{ fieldId: 'a_met1', descending: true }],
    limit: 3,
};
const choice = (
    value: string,
    probability = 0.99,
): DecisionAnswers[string] => ({
    type: 'choice',
    choice: value,
    confidence: probability,
    probabilities: { [value]: probability },
});
const answers: DecisionAnswers = {
    rankingRequest: choice('0'),
    rankingDirection: choice('descending'),
    rankingMeasure: choice('a_met1'),
};
const prepare = (question = 'Top 3 customers by revenue', executed = query) =>
    prepareRankingCheck({ question, query: executed, explore: validExplore });

describe('deterministic query ranking review', () => {
    it.each(['Show the top 3.', 'Show the top 3, please'])(
        'accepts ordinary punctuation after a complete count: %s',
        (question) => {
            expect(
                prepare(question, { ...query, limit: 10 })?.advice(answers),
            ).toEqual([expect.stringContaining('return 3 rows')]);
        },
    );
    it('keeps a correct ranking and secondary tie-breakers unchanged', () => {
        const executed = {
            ...query,
            sorts: [...query.sorts, { fieldId: 'b_dim1', descending: false }],
        };
        const before = structuredClone(executed);
        expect(prepare(undefined, executed)?.advice(answers)).toEqual([]);
        expect(executed).toEqual(before);
    });

    it.each([
        { fieldId: 'a_met1', descending: false },
        { fieldId: 'b_dim1', descending: true },
    ])(
        'identifies a wrong primary sort without changing execution: %j',
        (sort) => {
            const executed = { ...query, sorts: [sort] };
            const before = structuredClone(executed);
            expect(prepare(undefined, executed)?.advice(answers)).toEqual([
                expect.stringContaining('sort first by a_met1 descending'),
            ]);
            expect(executed).toEqual(before);
        },
    );

    it('handles bottom rankings and reports both missing sort and wrong limit', () => {
        const bottomAnswers = {
            ...answers,
            rankingDirection: choice('ascending'),
        };
        expect(
            prepare('Bottom 3 customers by revenue', {
                ...query,
                sorts: [],
                limit: 100,
            })?.advice(bottomAnswers),
        ).toEqual([
            expect.stringContaining(
                'sort first by a_met1 ascending and return 3 rows',
            ),
        ]);
        expect(
            prepare('Bottom 3 customers by revenue', {
                ...query,
                sorts: [{ fieldId: 'a_met1', descending: false }],
            })?.advice(bottomAnswers),
        ).toEqual([]);
    });

    it.each([
        ['Five highest customers by revenue', 5, 'descending'],
        ['Top ten customers by revenue', 10, 'descending'],
        ['Show the 5 lowest customers by revenue', 5, 'ascending'],
    ] as const)(
        'lets JEV resolve a ranking phrased as %s',
        (question, limit, direction) => {
            const prepared = prepare(question, { ...query, limit: 100 });
            expect(prepared?.questions.rankingRequest).toMatchObject({
                criteria: { 0: expect.any(String) },
            });
            expect(
                prepared?.advice({
                    ...answers,
                    rankingDirection: choice(direction),
                }),
            ).toEqual([expect.stringContaining(`return ${limit} rows`)]);
        },
    );

    it('requires JEV to resolve both the count and direction before advising', () => {
        const prepared = prepare('Five highest customers by revenue', {
            ...query,
            limit: 100,
        });
        expect(
            prepared?.advice({
                ...answers,
                rankingDirection: choice('none'),
            }),
        ).toEqual([]);
        expect(
            prepared?.advice({
                ...answers,
                rankingRequest: choice('none'),
            }),
        ).toEqual([]);
    });

    it('selects the ranking count without confusing it with a year', () => {
        const prepared = prepare('Five highest customers in 2024 by revenue', {
            ...query,
            limit: 100,
        });
        expect(
            prepared?.advice({
                ...answers,
                rankingRequest: choice('1'),
            }),
        ).toEqual([expect.stringContaining('return 5 rows')]);
    });

    it.each([null, 2, 5])(
        'compares the executed limit %s numerically',
        (limit) => {
            expect(
                prepare(undefined, { ...query, limit })?.advice(answers),
            ).toEqual([expect.stringContaining('return 3 rows')]);
        },
    );

    it.each([
        'Revenue by customer',
        'top 3.5 percent',
        'top 30%',
        'top 30 %',
        'top 3,000 customers',
        'top 0 customers',
        'top 1000000 customers',
        'constructor',
    ])(
        'does not interpret unsupported text as a complete count: %s',
        (question) => {
            expect(prepare(question)).toBeNull();
        },
    );

    it.each([
        {},
        { ...answers, rankingRequest: choice('none') },
        { ...answers, rankingRequest: choice('8') },
        { ...answers, rankingRequest: choice('0', 0.94) },
        { ...answers, rankingDirection: choice('none') },
        { ...answers, rankingDirection: choice('descending', 0.94) },
        { ...answers, rankingMeasure: choice('none') },
        { ...answers, rankingMeasure: choice('private_revenue') },
        { ...answers, rankingMeasure: choice('a_met1', 0.94) },
    ])(
        'abstains on unavailable, unsupported or uncertain mapping',
        (decisions) => {
            expect(
                prepare(undefined, { ...query, sorts: [], limit: 100 })?.advice(
                    decisions,
                ),
            ).toEqual([]);
        },
    );

    it('leaves unsupported custom metrics, incomplete context and pivot sorts to ordinary review', () => {
        expect(
            prepare(undefined, { ...query, metrics: ['custom_revenue'] }),
        ).toBeNull();
        expect(
            prepareRankingCheck({
                question: 'top 3',
                query,
                explore: validExplore,
                conversation: {
                    incomplete: true,
                    messages: [],
                    instruction: null,
                    compactionSummary: null,
                },
            }),
        ).toBeNull();
        expect(
            prepare(undefined, {
                ...query,
                sorts: [
                    {
                        fieldId: 'a_met1',
                        descending: false,
                        pivotValues: [{ reference: 'b_dim1', value: 'EMEA' }],
                    },
                ],
            })?.advice(answers),
        ).toEqual([]);
    });

    it.each([0.86, 0.99])(
        'returns one specific correction in the existing call with semantic score %s',
        async (score) => {
            const decisions = new AiDecisionClient({
                apiKey: null,
                model: 'test',
                timeoutMs: 100,
            });
            const evaluate = vi.spyOn(decisions, 'evaluate').mockResolvedValue({
                ...answers,
                ranking: { type: 'noul', noul: score },
            });
            const executed = {
                ...query,
                sorts: [{ fieldId: 'a_met1', descending: false }],
            };
            const advice = await checkQueryIntent({
                decisions,
                question: 'Top 3 customers by revenue',
                query: { queryConfig: executed },
                explore: validExplore,
            });
            expect(advice).toEqual([
                expect.stringContaining(
                    'Sort direction and row limit were compared in code',
                ),
            ]);
            expect(evaluate).toHaveBeenCalledOnce();
            expect(
                Object.keys(evaluate.mock.calls[0][0].questions),
            ).toHaveLength(8);
        },
    );
});
