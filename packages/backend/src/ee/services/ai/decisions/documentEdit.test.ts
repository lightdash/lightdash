import { AiDecisionClient, type DecisionAnswers } from './AiDecisionClient';
import {
    decideDocumentEdit,
    describeDocumentEdit,
    extractNameCandidates,
    getDocumentEdit,
    getDocumentEditCharts,
    interpretDocumentEdit,
    type DocumentEditContext,
} from './documentEdit';

const markdown = [
    '# Payments review',
    'How customers pay.',
    '<document-chart id="c1" title="Revenue by method" type="Bar chart" explore="payments">',
    'Credit cards dominate.',
    '<document-chart id="c2" title="Payment count" type="Bar chart" explore="payments">',
    '## Detail',
    '<document-chart id="c3" title="Both metrics" type="Table" explore="payments">',
].join('\n\n');

const context: DocumentEditContext = {
    slug: 'payments-review',
    name: 'Payments review',
    versionUuid: '6f0b5f8e-0b8e-4a8e-9c1e-2d1b2a3c4d5e',
    markdown,
    charts: getDocumentEditCharts(markdown),
};

const choice = (
    value: string,
    probabilities: Record<string, number> = { [value]: 0.95 },
    confidence = 0.95,
) => ({ type: 'choice' as const, choice: value, confidence, probabilities });

const interpret = (answers: DecisionAnswers, prompt = '') =>
    interpretDocumentEdit({
        answers,
        context,
        nameCandidates: extractNameCandidates(prompt),
    });

describe('extractNameCandidates', () => {
    it('takes the phrase after "to" as a new name', () => {
        expect(
            extractNameCandidates('Rename this document to Q4 review.'),
        ).toEqual(['Q4 review']);
    });

    it('takes quoted phrases and "call it" names', () => {
        expect(extractNameCandidates('call it "Payments 2026"')).toEqual([
            'Payments 2026',
        ]);
    });

    it('finds nothing in a request without a name', () => {
        expect(extractNameCandidates('remove the second chart')).toEqual([]);
    });
});

describe('getDocumentEditCharts', () => {
    it('lists charts in reading order with their titles', () => {
        expect(context.charts).toEqual([
            { id: 'c1', name: 'Revenue by method' },
            { id: 'c2', name: 'Payment count' },
            { id: 'c3', name: 'Both metrics' },
        ]);
    });
});

describe('interpretDocumentEdit', () => {
    it('renames the Document to the name JEV picks', () => {
        expect(
            interpret(
                {
                    kind: choice('rename_document'),
                    name: choice('name_0'),
                },
                'rename this to Q4 review',
            ),
        ).toEqual({
            type: 'intent',
            intent: { kind: 'rename_document', name: 'Q4 review' },
        });
    });

    it('leaves requests outside the listed edits to the agent', () => {
        expect(interpret({ kind: choice('other') })).toEqual({
            type: 'not_an_edit',
        });
    });

    it('does not apply an edit JEV is unsure about', () => {
        expect(
            interpret({
                kind: choice('remove_chart', { remove_chart: 0.6 }, 0.6),
                chart: choice('c2'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'kind' });
    });

    it('does not rename without an exact name', () => {
        expect(
            interpret(
                {
                    kind: choice('rename_chart'),
                    chart: choice('c1'),
                    name: choice('none'),
                },
                'rename the first chart to Revenue split',
            ),
        ).toEqual({ type: 'unresolved', reason: 'name' });
    });

    it('does not guess the chart when none is clearly meant', () => {
        expect(
            interpret({ kind: choice('remove_chart'), chart: choice('none') }),
        ).toEqual({ type: 'unresolved', reason: 'chart' });
    });

    it('pools equivalent placements, such as below chart 2 and above chart 3', () => {
        expect(
            interpret({
                kind: choice('move_chart'),
                chart: choice('c1'),
                placement: choice(
                    'after_c2',
                    { after_c2: 0.45, before_c3: 0.44, after_c3: 0.11 },
                    0.45,
                ),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'move_chart',
                chartId: 'c1',
                placement: { position: 'after', chartId: 'c2' },
            },
        });
    });

    it('moves a chart within its section', () => {
        expect(
            interpret({
                kind: choice('move_chart'),
                chart: choice('c2'),
                placement: choice('before_c1'),
            }),
        ).toEqual({
            type: 'intent',
            intent: {
                kind: 'move_chart',
                chartId: 'c2',
                placement: { position: 'before', chartId: 'c1' },
            },
        });
    });

    it('leaves a move across a heading to the agent', () => {
        expect(
            interpret({
                kind: choice('move_chart'),
                chart: choice('c3'),
                placement: choice('before_c1'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'crosses-section' });
    });

    it('does not move a chart to where it already is', () => {
        expect(
            interpret({
                kind: choice('move_chart'),
                chart: choice('c2'),
                placement: choice('after_c1'),
            }),
        ).toEqual({ type: 'unresolved', reason: 'no-change' });
    });
});

describe('getDocumentEdit', () => {
    it('removes only the chart tag, keeping the text and stored tag form', () => {
        expect(
            getDocumentEdit({ kind: 'remove_chart', chartId: 'c2' }, context),
        ).toEqual({
            type: 'content',
            baseVersionUuid: context.versionUuid,
            charts: {},
            markdown: [
                '# Payments review',
                'How customers pay.',
                '<document-chart id="c1">',
                'Credit cards dominate.',
                '## Detail',
                '<document-chart id="c3">',
            ].join('\n\n'),
        });
    });

    it('moves a chart block above another chart', () => {
        const edit = getDocumentEdit(
            {
                kind: 'move_chart',
                chartId: 'c3',
                placement: { position: 'before', chartId: 'c1' },
            },
            context,
        );
        expect(edit.type === 'content' && edit.markdown).toBe(
            [
                '# Payments review',
                'How customers pay.',
                '<document-chart id="c3">',
                '<document-chart id="c1">',
                'Credit cards dominate.',
                '<document-chart id="c2">',
                '## Detail',
            ].join('\n\n'),
        );
    });

    it('renames a chart with a patch on the version JEV read', () => {
        expect(
            getDocumentEdit(
                { kind: 'rename_chart', chartId: 'c1', name: 'Revenue split' },
                context,
            ),
        ).toEqual({
            type: 'chart',
            baseVersionUuid: context.versionUuid,
            chartId: 'c1',
            patch: [
                { op: 'replace', path: '/chart/name', value: 'Revenue split' },
            ],
        });
    });

    it('renames the Document through its metadata', () => {
        expect(
            getDocumentEdit({ kind: 'rename_document', name: 'Q4' }, context),
        ).toEqual({ type: 'metadata', name: 'Q4' });
    });
});

describe('describeDocumentEdit', () => {
    it('names the charts it changed, escaping Markdown', () => {
        expect(
            describeDocumentEdit(
                {
                    kind: 'move_chart',
                    chartId: 'c3',
                    placement: { position: 'before', chartId: 'c1' },
                },
                {
                    charts: [
                        { id: 'c1', name: 'Revenue *by* method' },
                        { id: 'c3', name: 'Both metrics' },
                    ],
                },
            ),
        ).toBe('Moved **Both metrics** above **Revenue \\*by\\* method**.');
    });
});

describe('decideDocumentEdit', () => {
    const setup = (answers: DecisionAnswers | null) => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                answers
                    ? Response.json({ model: 'test', answers })
                    : new Response('unavailable', { status: 503 }),
            );
        return {
            fetcher,
            decisions: new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                fetcher,
            ),
        };
    };

    it('asks JEV about chart names only, never the Document text', async () => {
        const { decisions, fetcher } = setup({
            kind: choice('remove_chart', { remove_chart: 0.95, other: 0.05 }),
            chart: choice('c2', { c2: 0.95, none: 0.05 }),
            placement: choice('none', { none: 1 }),
        });
        const result = await decideDocumentEdit({
            decisions,
            prompt: 'remove the payment count chart',
            conversation: [],
            context,
        });
        expect(result.resolution).toEqual({
            type: 'intent',
            intent: { kind: 'remove_chart', chartId: 'c2' },
        });
        const body = String(fetcher.mock.calls[0][1]?.body);
        expect(body).toContain('Payment count');
        expect(body).not.toContain('Credit cards dominate');
        expect(Object.keys(JSON.parse(body).questions)).toEqual([
            'kind',
            'chart',
            'placement',
        ]);
    });

    it('leaves the turn to the agent when JEV does not answer', async () => {
        const { decisions } = setup(null);
        const result = await decideDocumentEdit({
            decisions,
            prompt: 'rename it to Q4',
            conversation: [],
            context,
        });
        expect(result).toEqual({
            resolution: { type: 'unresolved', reason: 'decision-unavailable' },
            answers: null,
        });
    });
});
