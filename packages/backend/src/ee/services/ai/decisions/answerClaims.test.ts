import { AiDecisionClient } from './AiDecisionClient';
import {
    AnswerClaimVerifier,
    extractNumericClaims,
    extractQualitativeClaims,
} from './answerClaims';
import { AnswerEvidence } from './answerEvidence';

const fixture = ({
    operation = 'value',
    kind = 'data',
    aMonth = 'Feb',
    bMonth = 'Jan',
    absent = false,
    low = false,
    limit = 100,
    maxRows = 100,
} = {}) => {
    const evidence = new AnswerEvidence();
    evidence.record({
        queryUuid: 'actual-query-uuid',
        rows: [
            { month: 'Jan', revenue: '100' },
            { month: 'Feb', revenue: '112' },
        ],
        rowCount: 2,
        fields: {},
        maxContextRows: maxRows,
        limit,
        scope: { explore: 'orders', period: '2024' },
    });
    const decisions = new AiDecisionClient({
        apiKey: null,
        timeoutMs: 100,
        model: 'test',
    });
    const evaluate = vi
        .spyOn(decisions, 'evaluate')
        .mockImplementation(async ({ state, questions }) => {
            const input = state as {
                cells: {
                    id: string;
                    fieldId: string;
                    coordinates: Record<string, string>;
                }[];
            };
            const ref = (month: string) =>
                input.cells.find(
                    (cell) =>
                        cell.fieldId === 'revenue' &&
                        cell.coordinates.month === month,
                )?.id ?? 'none';
            return Object.fromEntries(
                Object.keys(questions).map((key) => {
                    const choices = {
                        kind,
                        operation,
                        a: absent ? 'none' : ref(aMonth),
                        b: ref(bMonth),
                    };
                    const part = key.slice(
                        key.lastIndexOf('_') + 1,
                    ) as keyof typeof choices;
                    const choice = choices[part];
                    return [
                        key,
                        {
                            type: 'choice' as const,
                            choice,
                            confidence: low ? 0.5 : 0.99,
                            probabilities: { [choice]: 1 },
                        },
                    ];
                }),
            );
        });
    return {
        evidence,
        decisions,
        evaluate,
        verifier: new AnswerClaimVerifier(
            decisions,
            evidence,
            'Revenue by month',
        ),
    };
};

describe('numeric answer checks', () => {
    it('extracts qualitative comparisons and causal assertions', () => {
        expect(
            extractQualitativeClaims(
                'EMEA led revenue.\n### Highest revenue\nDid costs increase?\nMarketing caused the lift.',
            ).map(({ text }) => text),
        ).toEqual(['EMEA led revenue.', 'Marketing caused the lift.']);
    });

    it('extracts prose values without treating code, links, dates or list numbering as claims', () => {
        const text =
            '1. Revenue was **35**, up .5%.\n```yaml\nlimit: 1000\n```\nOn 2024-01-01 see https://site/123 and [[lightdash-export:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa]].';
        const claims = extractNumericClaims(text);
        expect(claims).toHaveLength(2);
        expect(claims[0].number.value.numerator).toBe(35n);
        expect(claims[1].number.value.numerator).toBe(5n);
        expect(claims[1].masked).toContain('[NUMBER]%');
    });
    it('retains percentage words and abstains on ambiguous locale separators', () => {
        const claims = extractNumericClaims(
            'Growth was 12 percent and the locale-formatted value was 1.000,50.',
        );
        expect(claims).toHaveLength(1);
        expect(claims[0].number.percent).toBe(true);
        expect(claims[0].masked).toContain('[NUMBER]%');
    });
    it('matches a cell with concrete provenance and withholds numeric values from the selector', async () => {
        const { verifier, evaluate } = fixture();
        const result = await verifier.verify('February revenue was 112.');
        expect(result.text).toBe('February revenue was 112.');
        expect(result.checks[0]).toMatchObject({
            status: 'matched',
            sourceCells: ['query_1:1:revenue'],
            expected: '112',
        });
        expect(JSON.stringify(evaluate.mock.calls[0][0].state)).not.toContain(
            '112',
        );
    });
    it('corrects a wrong number before it reaches the response', async () => {
        const { verifier } = fixture();
        const result = await verifier.verify('February revenue was 999.');
        expect(result.text).not.toContain('999');
        expect(result.text).toContain('**112**');
        expect(result.text).toContain('month: Feb');
        expect(result.checks[0].status).toBe('mismatch');
    });
    it.each(['percent_change', 'percent_increase'])(
        'computes %s in code',
        async (operation) => {
            const { verifier } = fixture({ operation });
            expect(
                (await verifier.verify('Revenue grew 12%.')).checks[0].status,
            ).toBe('matched');
            const incorrect = await verifier.verify('Revenue grew 13%.');
            expect(incorrect.checks[0]).toMatchObject({
                status: 'mismatch',
                expected: '12',
                sourceCells: ['query_1:1:revenue', 'query_1:0:revenue'],
            });
            expect(incorrect.text).toContain('**12%**');
        },
    );
    it('catches a wrong direction even if the magnitude happens to match', async () => {
        const { verifier } = fixture({ operation: 'percent_decrease' });
        const result = await verifier.verify('Revenue fell 12%.');
        expect(result.checks[0].status).toBe('mismatch');
        expect(result.text).toContain('**12%**');
        expect(result.text).not.toContain('fell');
    });
    it('checks a claimed maximum against the complete result in code', async () => {
        const { verifier } = fixture({ operation: 'maximum', aMonth: 'Jan' });
        const result = await verifier.verify(
            'January had the highest revenue, 100.',
        );
        expect(result.checks[0].status).toBe('mismatch');
        expect(result.text).toContain('month: Feb');
        expect(result.text).toContain('**112**');
    });

    it('checks qualitative extrema without exposing values to the selector', async () => {
        const incorrect = fixture({ operation: 'maximum', aMonth: 'Jan' });
        const result = await incorrect.verifier.verify(
            'January had the highest revenue.',
        );
        expect(result.qualitativeChecks?.[0]).toMatchObject({
            status: 'mismatch',
            operation: 'maximum',
        });
        expect(result.text).not.toContain('January had the highest');
        expect(
            JSON.stringify(incorrect.evaluate.mock.calls[0][0].state),
        ).not.toContain('112');

        const correct = fixture({ operation: 'maximum', aMonth: 'Feb' });
        expect(
            (await correct.verifier.verify('February had the highest revenue.'))
                .qualitativeChecks?.[0].status,
        ).toBe('matched');
    });

    it('withholds causal claims even when the result contains both measures', async () => {
        const { verifier } = fixture({ operation: 'causation' });
        const result = await verifier.verify(
            'The revenue increase was caused by February demand.',
        );
        expect(result.qualitativeChecks?.[0].status).toBe('unsupported');
        expect(result.text).toContain('do not establish');
        expect(result.text).not.toContain('caused by');
    });

    it('does not certify a superlative from a single returned comparison row', async () => {
        const evidence = new AnswerEvidence();
        evidence.record({
            queryUuid: 'single-row',
            rows: [{ cost_tier: 'Low Cost', average_cost: '378.85' }],
            rowCount: 1,
            fields: {},
            maxContextRows: 100,
            limit: 100,
            scope: { cohort: 'high-risk middle-aged patients' },
        });
        const decisions = new AiDecisionClient({
            apiKey: null,
            timeoutMs: 100,
            model: 'test',
        });
        vi.spyOn(decisions, 'evaluate').mockImplementation(
            async ({ questions }) =>
                Object.fromEntries(
                    Object.keys(questions).map((key) => {
                        let value = 'none';
                        if (key.endsWith('_operation')) value = 'minimum';
                        else if (key.endsWith('_a')) value = 'c0';
                        return [
                            key,
                            {
                                type: 'choice' as const,
                                choice: value,
                                confidence: 0.99,
                                probabilities: { [value]: 1 },
                            },
                        ];
                    }),
                ),
        );
        const verifier = new AnswerClaimVerifier(
            decisions,
            evidence,
            'Break down this cohort by cost tier',
        );
        const result = await verifier.verify(
            'This is the cheapest group to serve.',
        );
        expect(result.qualitativeChecks?.[0].status).toBe('unsupported');
        expect(result.text).not.toContain('cheapest');
    });
    it.each([{ limit: 2 }, { maxRows: 1 }])(
        'does not certify a maximum from a capped result: %s',
        async (options) => {
            const { verifier } = fixture({
                operation: 'maximum',
                aMonth: 'Jan',
                ...options,
            });
            expect(
                (await verifier.verify('January had the highest revenue, 100.'))
                    .checks[0].status,
            ).toBe('unknown');
        },
    );
    it('does not infer zero for an absent entity', async () => {
        const { verifier } = fixture({ absent: true });
        const result = await verifier.verify('March revenue was 0.');
        expect(result.checks[0].status).toBe('unsupported');
        expect(result.text).not.toContain('was 0');
    });
    it.each(['literal', 'hypothetical'])(
        'preserves %s values without claiming they are verified data',
        async (kind) => {
            const { verifier } = fixture({ kind });
            const result = await verifier.verify(
                'Compare 2024 with the previous year.',
            );
            expect(result.text).toBe('Compare 2024 with the previous year.');
            expect(result.checks[0].status).toBe('not-data');
        },
    );
    it('preserves prose on ambiguity or provider outage and caches the result', async () => {
        const { verifier, evaluate } = fixture({ low: true });
        const text = 'Revenue was 999.';
        expect((await verifier.verify(text)).text).toBe(text);
        expect((await verifier.verify(text)).checks[0].status).toBe('unknown');
        expect(evaluate).toHaveBeenCalledTimes(1);
        evaluate.mockResolvedValue(null);
        expect((await verifier.verify('Revenue was 888.')).text).toBe(
            'Revenue was 888.',
        );
    });
    it('bounds calls and batches multiple claims', async () => {
        const { verifier, evaluate } = fixture();
        await verifier.verify('Revenue was 112.\nFebruary revenue was 112.');
        expect(Object.keys(evaluate.mock.calls[0][0].questions)).toHaveLength(
            8,
        );
        await verifier.verify('Revenue was 113.');
        await verifier.verify('Revenue was 114.');
        await verifier.verify('Revenue was 115.');
        expect(evaluate).toHaveBeenCalledTimes(3);
    });
    it('never treats a missing source as disproved after older evidence was evicted', async () => {
        const { verifier, evidence } = fixture({ absent: true });
        for (let i = 0; i < 6; i += 1)
            evidence.record({
                queryUuid: `query-${i}`,
                rows: [{ revenue: 1 }],
                rowCount: 1,
                fields: {},
                maxContextRows: 100,
                limit: 100,
                scope: {},
            });
        expect(
            (await verifier.verify('March revenue was 0.')).checks[0].status,
        ).toBe('unknown');
    });
});
