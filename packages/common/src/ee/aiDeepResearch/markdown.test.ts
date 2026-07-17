import {
    aiDeepResearchChartDefinitionSchema,
    countDeepResearchFindings,
    findDeepResearchChartBlocks,
    findDeepResearchChartRefs,
    getDeepResearchChartKey,
    lintDeepResearchReport,
    spliceDeepResearchRanges,
    type AiDeepResearchChartDefinition,
} from './markdown';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const chartConfig = {
    defaultVizType: 'bar' as const,
    xAxisDimension: 'orders_month',
    yAxisMetrics: ['orders_total_revenue'],
    groupBy: null,
    xAxisType: 'time' as const,
    stackBars: null,
    lineType: null,
    funnelDataInput: null,
    xAxisLabel: 'Month',
    yAxisLabel: 'Revenue',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
};

const warehouseChart = (
    queryUuid: string,
    title = 'Revenue by month',
): AiDeepResearchChartDefinition => ({
    source: 'warehouse',
    queryUuid,
    title,
    chartConfig,
});

const inlineChart = (
    key: string,
    title = 'Derived ratio',
): AiDeepResearchChartDefinition => ({
    source: 'inline',
    key,
    title,
    chartConfig,
    columns: [
        { id: 'segment', label: 'Segment', type: 'string' },
        { id: 'ratio', label: 'Ratio', type: 'number' },
    ],
    rows: [
        ['enterprise', 0.8],
        ['smb', 2.4],
    ],
});

const validReport = `The seasonal dip is driven by B2B churn, with high confidence overall.

## Baseline revenue trend

<confidence level="high">Complete order history since 2022.</confidence>

Revenue grew steadily until spring.

[Revenue by month](#chart-${UUID_A})

The dip aligns with contract renewals.

## Conclusion

- B2B churn explains the dip.
`;

describe('findDeepResearchChartRefs', () => {
    it('finds chart reference links with offsets', () => {
        const refs = findDeepResearchChartRefs(validReport);
        expect(refs).toHaveLength(1);
        expect(refs[0].key).toBe(UUID_A);
        expect(refs[0].title).toBe('Revenue by month');
        expect(validReport.slice(refs[0].start, refs[0].end)).toBe(
            `[Revenue by month](#chart-${UUID_A})`,
        );
    });

    it('ignores references inside code fences', () => {
        const refs = findDeepResearchChartRefs(
            '```md\n[Example](#chart-abc)\n```\n\n[Real](#chart-xyz-1)',
        );
        expect(refs).toHaveLength(1);
        expect(refs[0].key).toBe('xyz-1');
    });

    it('does not match ordinary links or citations', () => {
        expect(
            findDeepResearchChartRefs(
                '[Docs](https://example.com) and [1] and [anchor](#sources)',
            ),
        ).toHaveLength(0);
    });
});

describe('spliceDeepResearchRanges', () => {
    it('replaces multiple ranges without invalidating offsets', () => {
        const markdown = `a ${'[X](#chart-k1)'} b ${'[Y](#chart-k2)'} c`;
        const refs = findDeepResearchChartRefs(markdown);
        const result = spliceDeepResearchRanges(
            markdown,
            refs.map((ref, i) => ({
                match: ref,
                replacement: `[removed ${i}]`,
            })),
        );
        expect(result).toContain('[removed 0]');
        expect(result).toContain('[removed 1]');
        expect(result).not.toContain('#chart-');
    });
});

describe('countDeepResearchFindings', () => {
    it('counts confidence tags outside code fences', () => {
        const markdown = `## A\n\n<confidence level="high">ok</confidence>\n\n\`\`\`md\n<confidence level="low">not me</confidence>\n\`\`\`\n\n## B\n\n<confidence level="low">meh</confidence>`;
        expect(countDeepResearchFindings(markdown)).toBe(2);
    });
});

describe('chart definition schemas', () => {
    it('derives keys per source', () => {
        expect(getDeepResearchChartKey(warehouseChart(UUID_A))).toBe(UUID_A);
        expect(getDeepResearchChartKey(inlineChart('tickets-per-1k'))).toBe(
            'tickets-per-1k',
        );
    });
});

describe('lintDeepResearchReport', () => {
    it('accepts a valid report', () => {
        expect(
            lintDeepResearchReport(validReport, [warehouseChart(UUID_A)]),
        ).toEqual([]);
    });

    it('accepts an inline chart referenced by key', () => {
        const markdown = validReport.replace(
            `[Revenue by month](#chart-${UUID_A})`,
            '[Derived ratio](#chart-tickets-per-1k)',
        );
        expect(
            lintDeepResearchReport(markdown, [inlineChart('tickets-per-1k')]),
        ).toEqual([]);
    });

    it('requires every defined chart to be referenced exactly once', () => {
        const errors = lintDeepResearchReport(validReport, [
            warehouseChart(UUID_A),
            warehouseChart(UUID_B, 'Orphan chart'),
        ]);
        expect(
            errors.some(
                (e) => e.includes(UUID_B) && e.includes('exactly once'),
            ),
        ).toBe(true);
    });

    it('rejects references to undefined charts', () => {
        const errors = lintDeepResearchReport(validReport, []);
        expect(
            errors.some(
                (e) =>
                    e.includes(UUID_A) && e.includes('no chart with that key'),
            ),
        ).toBe(true);
    });

    it('rejects a chart referenced twice', () => {
        const markdown = validReport.replace(
            'The dip aligns with contract renewals.',
            `The dip aligns with contract renewals.\n\n[Again](#chart-${UUID_A})`,
        );
        const errors = lintDeepResearchReport(markdown, [
            warehouseChart(UUID_A),
        ]);
        expect(errors.some((e) => e.includes('found 2 references'))).toBe(true);
    });

    it('rejects more than one chart reference in a finding section', () => {
        const markdown = validReport.replace(
            'The dip aligns with contract renewals.',
            `The dip aligns with contract renewals.\n\n[Second](#chart-${UUID_B})`,
        );
        const errors = lintDeepResearchReport(markdown, [
            warehouseChart(UUID_A),
            warehouseChart(UUID_B, 'Second'),
        ]);
        expect(
            errors.some(
                (e) =>
                    e.includes('Baseline revenue trend') &&
                    e.includes('at most one chart per finding'),
            ),
        ).toBe(true);
    });

    it('accepts one chart in each of two finding sections', () => {
        const markdown = validReport.replace(
            '## Conclusion',
            `## Second finding\n\n<confidence level="medium">ok</confidence>\n\nMore prose.\n\n[Second](#chart-${UUID_B})\n\n## Conclusion`,
        );
        expect(
            lintDeepResearchReport(markdown, [
                warehouseChart(UUID_A),
                warehouseChart(UUID_B, 'Second'),
            ]),
        ).toEqual([]);
    });

    it('rejects duplicate chart keys', () => {
        const errors = lintDeepResearchReport(validReport, [
            warehouseChart(UUID_A),
            warehouseChart(UUID_A, 'Duplicate'),
        ]);
        expect(errors.some((e) => e.includes('defined 2 times'))).toBe(true);
    });

    it('rejects more than the maximum number of charts', () => {
        const charts = Array.from({ length: 9 }, (_, i) =>
            warehouseChart(`33333333-3333-4333-8333-33333333333${i}`),
        );
        const errors = lintDeepResearchReport(validReport, charts);
        expect(errors.some((e) => e.includes('at most 8'))).toBe(true);
    });

    it('rejects legacy chart code fences', () => {
        const markdown = validReport.replace(
            `[Revenue by month](#chart-${UUID_A})`,
            `\`\`\`chart\n{"queryUuid":"${UUID_A}"}\n\`\`\``,
        );
        const errors = lintDeepResearchReport(markdown, [
            warehouseChart(UUID_A),
        ]);
        expect(errors.some((e) => e.includes('Do not embed ```chart'))).toBe(
            true,
        );
    });

    it('requires intro prose before the first heading', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(/^.*\n\n## Baseline/, '## Baseline'),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('introduction'))).toBe(true);
    });

    it('requires a conclusion section', () => {
        const errors = lintDeepResearchReport(
            validReport.replace('## Conclusion', '## Wrap up'),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('## Conclusion'))).toBe(true);
    });

    it('requires exactly one confidence tag per finding section', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                '<confidence level="high">Complete order history since 2022.</confidence>\n\n',
                '',
            ),
            [warehouseChart(UUID_A)],
        );
        expect(
            errors.some(
                (e) => e.includes('Baseline revenue trend') && e.includes('0'),
            ),
        ).toBe(true);
    });

    it('rejects a finding section with two confidence tags', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'Revenue grew steadily until spring.',
                '<confidence level="low">extra</confidence>\n\nRevenue grew steadily until spring.',
            ),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('found 2'))).toBe(true);
    });

    it('rejects invalid confidence levels', () => {
        const errors = lintDeepResearchReport(
            validReport.replace('level="high"', 'level="certain"'),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('invalid level'))).toBe(true);
    });

    it('rejects disallowed html tags', () => {
        const errors = lintDeepResearchReport(
            `${validReport}\n<script>alert(1)</script>\n`,
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('script'))).toBe(true);
    });

    it('ignores tags and headings inside code fences', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'Revenue grew steadily until spring.',
                'Revenue grew steadily until spring.\n\n```sql\n-- <script> ## Not a heading\nSELECT 1;\n```',
            ),
            [warehouseChart(UUID_A)],
        );
        expect(errors).toEqual([]);
    });

    it('rejects unbalanced tags', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'The dip aligns with contract renewals.',
                '<note>\n\nThe dip aligns with contract renewals.',
            ),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('Unbalanced <note>'))).toBe(true);
    });

    it('requires a sources section when citations are used', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            ),
            [warehouseChart(UUID_A)],
        );
        expect(errors.some((e) => e.includes('## Sources'))).toBe(true);
    });

    it('accepts citations when a sources section exists', () => {
        const errors = lintDeepResearchReport(
            `${validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            )}\n## Sources\n\n1. [Benchmarks](https://example.com) — baseline\n`,
            [warehouseChart(UUID_A)],
        );
        expect(errors).toEqual([]);
    });
});

describe('chart definition validation', () => {
    it('rejects grouped chart configs', () => {
        const result = aiDeepResearchChartDefinitionSchema.safeParse({
            ...warehouseChart(UUID_A),
            chartConfig: { ...chartConfig, groupBy: ['orders_status'] },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(
                result.error.issues.some((i) =>
                    i.message.includes('groupBy is not supported'),
                ),
            ).toBe(true);
        }
    });

    it('rejects inline rows wider than the columns', () => {
        const chart = inlineChart('bad-rows');
        const result = aiDeepResearchChartDefinitionSchema.safeParse({
            ...chart,
            rows: [['enterprise', 0.8, 'extra']],
        });
        expect(result.success).toBe(false);
    });

    it('rejects inline charts exceeding the row cap', () => {
        const chart = inlineChart('too-big');
        const result = aiDeepResearchChartDefinitionSchema.safeParse({
            ...chart,
            rows: Array.from({ length: 101 }, (_, i) => [`s${i}`, i]),
        });
        expect(result.success).toBe(false);
    });
});

describe('legacy chart fences', () => {
    it('still parses legacy fenced blocks for migration', () => {
        const legacy = `\`\`\`chart\n${JSON.stringify({
            queryUuid: UUID_A,
            title: 'Legacy',
            chartConfig,
        })}\n\`\`\``;
        const matches = findDeepResearchChartBlocks(legacy);
        expect(matches).toHaveLength(1);
        expect(matches[0].block?.queryUuid).toBe(UUID_A);
    });
});
