import {
    aiDeepResearchChartDefinitionSchema,
    applyDeepResearchChartRefs,
    countDeepResearchFindings,
    findDeepResearchChartRefs,
    lintDeepResearchReport,
    renderDeepResearchChartRefs,
    spliceDeepResearchRanges,
    type AiDeepResearchChartDefinition,
} from './markdown';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const chartTag = (
    id: string,
    title = 'Revenue by month',
    description = 'Revenue rose steadily until spring.',
) => `<chart id="${id}" title="${title}" description="${description}">`;

const published = (
    entries: Array<[string, { title: string; description: string }]>,
) => new Map(entries);

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

const validReport = `The seasonal dip is driven by B2B churn, with high confidence overall.

## Baseline revenue trend

<confidence level="high">Complete order history since 2022.</confidence>

Revenue grew steadily until spring.

${chartTag(UUID_A)}

The dip aligns with contract renewals.

## Conclusion

- B2B churn explains the dip.
`;

describe('findDeepResearchChartRefs', () => {
    it('finds chart tags with offsets and summaries', () => {
        const refs = findDeepResearchChartRefs(validReport);
        expect(refs).toHaveLength(1);
        expect(refs[0].key).toBe(UUID_A);
        expect(refs[0].title).toBe('Revenue by month');
        expect(refs[0].description).toBe('Revenue rose steadily until spring.');
        expect(validReport.slice(refs[0].start, refs[0].end)).toBe(
            chartTag(UUID_A),
        );
    });

    it('accepts a tag carrying only an id, because the server owns the rest', () => {
        const refs = findDeepResearchChartRefs(`<chart id="${UUID_A}">`);
        expect(refs).toHaveLength(1);
        expect(refs[0]).toMatchObject({
            key: UUID_A,
            title: '',
            description: '',
        });
    });

    it('ignores a tag with no usable id', () => {
        expect(
            findDeepResearchChartRefs('<chart title="No id here">'),
        ).toHaveLength(0);
        expect(
            findDeepResearchChartRefs('<chart id="not a uuid!">'),
        ).toHaveLength(0);
    });

    it('ignores references inside code fences', () => {
        const refs = findDeepResearchChartRefs(
            `\`\`\`md\n${chartTag('abc')}\n\`\`\`\n\n${chartTag('xyz-1')}`,
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

    it('does not support legacy chart links', () => {
        expect(
            findDeepResearchChartRefs(`[Revenue by month](#chart-${UUID_A})`),
        ).toHaveLength(0);
    });

    it('renders chart tags as internal links without exposing descriptions', () => {
        expect(renderDeepResearchChartRefs(validReport)).toContain(
            `[Revenue by month](#chart-${UUID_A})`,
        );
        expect(renderDeepResearchChartRefs(validReport)).not.toContain(
            'Revenue rose steadily until spring.',
        );
    });

    it('escapes chart titles before rendering internal links', () => {
        const markdown = chartTag(
            UUID_A,
            'Revenue ](https://attacker.example) [details',
        );
        const rendered = renderDeepResearchChartRefs(markdown);

        expect(rendered.trim()).toBe(
            `[Revenue \\](https://attacker.example) \\[details](#chart-${UUID_A})`,
        );
        expect(rendered).not.toContain('[Revenue ](https://attacker.example)');
    });

    it('decodes HTML entities and truncates over-long descriptions', () => {
        const refs = findDeepResearchChartRefs(
            `<chart id="${UUID_A}" title="Revenue &amp; margin" description="${'&amp;'.repeat(
                400,
            )}">`,
        );

        expect(refs[0]).toMatchObject({
            title: 'Revenue & margin',
            description: '&'.repeat(300),
        });
    });
});

describe('applyDeepResearchChartRefs', () => {
    it('rewrites a published reference with the title and description the server derived', () => {
        const result = applyDeepResearchChartRefs(
            `<chart id="${UUID_A}" title="Model guess" description="Model guess.">`,
            published([
                [
                    UUID_A,
                    { title: 'Server title', description: 'Server text.' },
                ],
            ]),
        );

        expect(result.trim()).toBe(
            `<chart id="${UUID_A}" title="Server title" description="Server text.">`,
        );
    });

    it('drops references the server could not back and keeps the narrative', () => {
        const markdown = `a ${chartTag('k1', 'X')} b ${chartTag('k2', 'Y')} c`;

        const result = applyDeepResearchChartRefs(
            markdown,
            published([['k2', { title: 'Kept', description: 'Still here.' }]]),
        );

        expect(result).not.toContain('id="k1"');
        expect(result).toContain('id="k2"');
        expect(result).toContain('a ');
        expect(result).toContain(' c');
    });

    it('leaves a readable report when nothing could be published', () => {
        const result = applyDeepResearchChartRefs(validReport, published([]));

        expect(findDeepResearchChartRefs(result)).toEqual([]);
        expect(result).toContain('The dip aligns with contract renewals.');
        expect(result).toContain('## Conclusion');
    });

    it('keeps only the first reference to the same chart', () => {
        const markdown = `${chartTag(UUID_A)}\n\n${chartTag(UUID_A, 'Again')}`;

        const result = applyDeepResearchChartRefs(
            markdown,
            published([[UUID_A, { title: 'Once', description: 'Only once.' }]]),
        );

        expect(findDeepResearchChartRefs(result)).toHaveLength(1);
    });

    it('removes malformed chart tags rather than leaving them in the report', () => {
        const result = applyDeepResearchChartRefs(
            `before <chart title="No id"> after`,
            published([]),
        );

        expect(result).not.toContain('<chart');
        expect(result).toContain('before');
        expect(result).toContain('after');
    });
});

describe('spliceDeepResearchRanges', () => {
    it('replaces multiple ranges without invalidating offsets', () => {
        const markdown = `a ${chartTag('k1', 'X')} b ${chartTag('k2', 'Y')} c`;
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
        expect(result).not.toContain('<chart');
    });
});

describe('countDeepResearchFindings', () => {
    it('counts non-structural level-two sections outside code fences', () => {
        const markdown = `## A\n\n<confidence level="high">ok</confidence>\n\n\`\`\`md\n## Not a finding\n\`\`\`\n\n## B\n\n<confidence level="low">meh</confidence>\n\n## Sources\n\n- source\n\n## Caveats\n\n- caveat\n\n## Conclusion\n\n- done`;
        expect(countDeepResearchFindings(markdown)).toBe(2);
    });
});

describe('lintDeepResearchReport', () => {
    it('accepts a valid report', () => {
        expect(lintDeepResearchReport(validReport)).toEqual([]);
    });

    it('never fails a report over its charts', () => {
        const markdown = validReport
            .replace(
                'The dip aligns with contract renewals.',
                `The dip aligns with contract renewals.\n\n${chartTag(
                    UUID_A,
                    'Duplicate',
                )}\n\n${chartTag(UUID_B, 'Second')}\n\n<chart id="not a uuid!">`,
            )
            .replace(chartTag(UUID_A), chartTag(UUID_A, 'T', 'x'.repeat(400)));

        expect(lintDeepResearchReport(markdown)).toEqual([]);
    });

    it('requires intro prose before the first heading', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(/^.*\n\n## Baseline/, '## Baseline'),
        );
        expect(errors.some((e) => e.includes('introduction'))).toBe(true);
    });

    it('requires a conclusion section', () => {
        const errors = lintDeepResearchReport(
            validReport.replace('## Conclusion', '## Wrap up'),
        );
        expect(errors.some((e) => e.includes('## Conclusion'))).toBe(true);
    });

    it('requires exactly one confidence tag per finding section', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                '<confidence level="high">Complete order history since 2022.</confidence>\n\n',
                '',
            ),
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
        );
        expect(errors.some((e) => e.includes('found 2'))).toBe(true);
    });

    it('rejects invalid confidence levels', () => {
        const errors = lintDeepResearchReport(
            validReport.replace('level="high"', 'level="certain"'),
        );
        expect(errors.some((e) => e.includes('invalid level'))).toBe(true);
    });

    it('rejects disallowed html tags', () => {
        const errors = lintDeepResearchReport(
            `${validReport}\n<script>alert(1)</script>\n`,
        );
        expect(errors.some((e) => e.includes('script'))).toBe(true);
    });

    it('ignores tags and headings inside code fences', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'Revenue grew steadily until spring.',
                'Revenue grew steadily until spring.\n\n```sql\n-- <script> ## Not a heading\nSELECT 1;\n```',
            ),
        );
        expect(errors).toEqual([]);
    });

    it('rejects unbalanced tags', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'The dip aligns with contract renewals.',
                '<note>\n\nThe dip aligns with contract renewals.',
            ),
        );
        expect(errors.some((e) => e.includes('Unbalanced <note>'))).toBe(true);
    });

    it('requires a sources section when citations are used', () => {
        const errors = lintDeepResearchReport(
            validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            ),
        );
        expect(errors.some((e) => e.includes('## Sources'))).toBe(true);
    });

    it('accepts citations when a sources section exists', () => {
        const errors = lintDeepResearchReport(
            `${validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            )}\n## Sources\n\n1. [Benchmarks](https://example.com) — baseline\n`,
        );
        expect(errors).toEqual([]);
    });
});

describe('chart definition validation', () => {
    it('rejects a chart that is not warehouse-backed', () => {
        const result = aiDeepResearchChartDefinitionSchema.safeParse({
            source: 'inline',
            key: 'tickets-per-1k',
            title: 'Derived ratio',
            chartConfig,
        });
        expect(result.success).toBe(false);
    });

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
});
