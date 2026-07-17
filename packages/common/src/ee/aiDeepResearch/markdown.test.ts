import {
    countDeepResearchFindings,
    extractDeepResearchCharts,
    findDeepResearchChartBlocks,
    lintDeepResearchReportMarkdown,
    spliceDeepResearchChartBlocks,
} from './markdown';

const chartJson = (queryUuid: string, title = 'Revenue by month') =>
    JSON.stringify({
        queryUuid,
        title,
        chartConfig: {
            defaultVizType: 'bar',
            xAxisDimension: 'orders_month',
            yAxisMetrics: ['orders_total_revenue'],
            groupBy: null,
            xAxisType: 'time',
            stackBars: null,
            lineType: null,
            funnelDataInput: null,
            xAxisLabel: 'Month',
            yAxisLabel: 'Revenue',
            secondaryYAxisMetric: null,
            secondaryYAxisLabel: null,
        },
    });

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const chartFence = (queryUuid: string, title?: string) =>
    `\`\`\`chart\n${chartJson(queryUuid, title)}\n\`\`\``;

const validReport = `The seasonal dip is driven by B2B churn, with high confidence overall.

## Baseline revenue trend

<confidence level="high">Complete order history since 2022.</confidence>

Revenue grew steadily until spring.

${chartFence(UUID_A)}

The dip aligns with contract renewals.

## Conclusion

- B2B churn explains the dip.
- Renewal timing is the main driver.
`;

describe('findDeepResearchChartBlocks', () => {
    it('finds a backtick chart block with offsets covering the fences', () => {
        const markdown = `intro\n\n${chartFence(UUID_A)}\n\nafter`;
        const matches = findDeepResearchChartBlocks(markdown);
        expect(matches).toHaveLength(1);
        expect(matches[0].block?.queryUuid).toBe(UUID_A);
        expect(matches[0].error).toBeNull();
        expect(markdown.slice(matches[0].start, matches[0].end)).toBe(
            `${chartFence(UUID_A)}\n`,
        );
    });

    it('finds tilde-fenced chart blocks', () => {
        const markdown = `~~~chart\n${chartJson(UUID_A)}\n~~~`;
        const matches = findDeepResearchChartBlocks(markdown);
        expect(matches).toHaveLength(1);
        expect(matches[0].block?.queryUuid).toBe(UUID_A);
    });

    it('ignores a chart fence nested inside a longer fence', () => {
        const markdown = `\`\`\`\`md\n${chartFence(UUID_A)}\n\`\`\`\`\n`;
        expect(findDeepResearchChartBlocks(markdown)).toHaveLength(0);
    });

    it('ignores non-chart fences', () => {
        const markdown = '```sql\nSELECT 1;\n```';
        expect(findDeepResearchChartBlocks(markdown)).toHaveLength(0);
    });

    it('captures an unclosed chart fence at end of document', () => {
        const markdown = `text\n\n\`\`\`chart\n${chartJson(UUID_A)}`;
        const matches = findDeepResearchChartBlocks(markdown);
        expect(matches).toHaveLength(1);
        expect(matches[0].end).toBe(markdown.length);
        expect(matches[0].block?.queryUuid).toBe(UUID_A);
    });

    it('reports invalid JSON with an actionable error', () => {
        const matches = findDeepResearchChartBlocks(
            '```chart\n{not json}\n```',
        );
        expect(matches).toHaveLength(1);
        expect(matches[0].block).toBeNull();
        expect(matches[0].error).toContain('not valid JSON');
    });

    it('rejects grouped charts with an actionable error', () => {
        const grouped = JSON.parse(chartJson(UUID_A));
        grouped.chartConfig.groupBy = ['orders_status'];
        const matches = findDeepResearchChartBlocks(
            `\`\`\`chart\n${JSON.stringify(grouped)}\n\`\`\``,
        );
        expect(matches[0].block).toBeNull();
        expect(matches[0].error).toContain('groupBy is not supported');
    });

    it('reports schema violations with the offending path', () => {
        const matches = findDeepResearchChartBlocks(
            `\`\`\`chart\n${JSON.stringify({
                queryUuid: 'not-a-uuid',
                title: 'x',
                chartConfig: null,
            })}\n\`\`\``,
        );
        expect(matches[0].block).toBeNull();
        expect(matches[0].error).toContain('queryUuid');
    });
});

describe('extractDeepResearchCharts', () => {
    it('returns parsed blocks only', () => {
        const markdown = `${chartFence(UUID_A)}\n\n\`\`\`chart\noops\n\`\`\``;
        const charts = extractDeepResearchCharts(markdown);
        expect(charts).toHaveLength(1);
        expect(charts[0].queryUuid).toBe(UUID_A);
    });
});

describe('spliceDeepResearchChartBlocks', () => {
    it('replaces multiple blocks without invalidating offsets', () => {
        const markdown = `a\n\n${chartFence(UUID_A)}\n\nb\n\n${chartFence(
            UUID_B,
        )}\n\nc`;
        const matches = findDeepResearchChartBlocks(markdown);
        const result = spliceDeepResearchChartBlocks(
            markdown,
            matches.map((match, i) => ({
                match,
                replacement: `[removed ${i}]`,
            })),
        );
        expect(result).toContain('[removed 0]');
        expect(result).toContain('[removed 1]');
        expect(result).not.toContain('```chart');
        expect(result).toContain('a\n');
        expect(result).toContain('b\n');
        expect(result).toContain('c');
    });
});

describe('countDeepResearchFindings', () => {
    it('counts confidence tags outside code fences', () => {
        const markdown = `## A\n\n<confidence level="high">ok</confidence>\n\n\`\`\`md\n<confidence level="low">not me</confidence>\n\`\`\`\n\n## B\n\n<confidence level="low">meh</confidence>`;
        expect(countDeepResearchFindings(markdown)).toBe(2);
    });
});

describe('lintDeepResearchReportMarkdown', () => {
    it('accepts a valid report', () => {
        expect(lintDeepResearchReportMarkdown(validReport)).toEqual([]);
    });

    it('requires intro prose before the first heading', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(/^.*\n\n## Baseline/, '## Baseline'),
        );
        expect(errors.some((e) => e.includes('introduction'))).toBe(true);
    });

    it('requires a conclusion section', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace('## Conclusion', '## Wrap up'),
        );
        expect(errors.some((e) => e.includes('## Conclusion'))).toBe(true);
    });

    it('requires at least one finding section', () => {
        const errors = lintDeepResearchReportMarkdown(
            'Intro only.\n\n## Conclusion\n\n- done',
        );
        expect(errors.some((e) => e.includes('finding section'))).toBe(true);
    });

    it('requires exactly one confidence tag per finding section', () => {
        const errors = lintDeepResearchReportMarkdown(
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

    it('rejects invalid confidence levels', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace('level="high"', 'level="certain"'),
        );
        expect(errors.some((e) => e.includes('invalid level'))).toBe(true);
    });

    it('rejects disallowed html tags', () => {
        const errors = lintDeepResearchReportMarkdown(
            `${validReport}\n<script>alert(1)</script>\n`,
        );
        expect(errors.some((e) => e.includes('script'))).toBe(true);
    });

    it('does not flag autolinks as html tags', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                'Revenue grew steadily until spring.',
                'Revenue grew steadily until spring, see <https://example.com>.',
            ),
        );
        expect(errors).toEqual([]);
    });

    it('rejects unbalanced tags', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                'The dip aligns with contract renewals.',
                '<note>\n\nThe dip aligns with contract renewals.',
            ),
        );
        expect(errors.some((e) => e.includes('Unbalanced <note>'))).toBe(true);
    });

    it('rejects more than one chart in a finding section', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                'The dip aligns with contract renewals.',
                `The dip aligns with contract renewals.\n\n${chartFence(
                    UUID_B,
                    'Second chart',
                )}`,
            ),
        );
        expect(
            errors.some(
                (e) =>
                    e.includes('Baseline revenue trend') &&
                    e.includes('at most one chart per finding'),
            ),
        ).toBe(true);
    });

    it('accepts one chart in each of two finding sections', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                '## Conclusion',
                `## Second finding\n\n<confidence level="medium">ok</confidence>\n\nMore prose.\n\n${chartFence(
                    UUID_B,
                    'Second chart',
                )}\n\n## Conclusion`,
            ),
        );
        expect(errors).toEqual([]);
    });

    it('rejects duplicate chart queryUuids', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                'The dip aligns with contract renewals.',
                `The dip aligns with contract renewals.\n\n${chartFence(
                    UUID_A,
                    'Duplicate',
                )}`,
            ),
        );
        expect(
            errors.some((e) => e.includes('more than one chart block')),
        ).toBe(true);
    });

    it('rejects more than the maximum number of charts', () => {
        const manyCharts = Array.from({ length: 9 }, (_, i) =>
            chartFence(`33333333-3333-4333-8333-33333333333${i}`, `Chart ${i}`),
        ).join('\n\n');
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(chartFence(UUID_A), manyCharts),
        );
        expect(errors.some((e) => e.includes('at most 8'))).toBe(true);
    });

    it('surfaces chart block json errors', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(chartFence(UUID_A), '```chart\n{broken\n```'),
        );
        expect(
            errors.some(
                (e) =>
                    e.includes('Chart block 1 is invalid') &&
                    e.includes('not valid JSON'),
            ),
        ).toBe(true);
    });

    it('requires a sources section when citations are used', () => {
        const errors = lintDeepResearchReportMarkdown(
            validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            ),
        );
        expect(errors.some((e) => e.includes('## Sources'))).toBe(true);
    });

    it('accepts citations when a sources section exists', () => {
        const errors = lintDeepResearchReportMarkdown(
            `${validReport.replace(
                'The dip aligns with contract renewals.',
                'The dip aligns with contract renewals [1].',
            )}\n## Sources\n\n1. [SaaS churn benchmarks](https://example.com) — industry baseline\n`,
        );
        expect(errors).toEqual([]);
    });
});
