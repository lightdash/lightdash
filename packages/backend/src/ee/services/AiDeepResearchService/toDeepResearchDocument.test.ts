import {
    parseDocumentContent,
    type DocumentChartContent,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toDeepResearchDocument } from './toDeepResearchDocument';

const QUERY_A = '11111111-1111-4111-8111-111111111111';
const QUERY_B = '22222222-2222-4222-8222-222222222222';

const chart = (name: string): DocumentChartContent => ({
    source: 'semantic',
    chart: {
        name,
        description: '',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_order_date_month'],
            metrics: ['orders_total_revenue'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: 'table' },
        tableConfig: { columnOrder: [] },
    } as unknown as SemanticChartAsCode,
});

const REPORT = `# Revenue grew in spikes

Revenue rose 40% across the quarter.

## Growth came in spikes

<chart id="${QUERY_A}" title="Monthly revenue" description="Revenue by month">

Two months drove most of the gain.

<warning title="Report adjusted">Some chart evidence was omitted.</warning>

### Detail

\`\`\`
## not a heading
\`\`\`

## Mix shifted to enterprise

<chart id="${QUERY_B}" title="Revenue by segment" description="Segments">

## Conclusion

Focus on enterprise.`;

describe('toDeepResearchDocument', () => {
    it('names the Document from the report title and promotes findings to sections', () => {
        const { name, content } = toDeepResearchDocument({
            markdown: REPORT,
            charts: new Map([
                [QUERY_A, chart('Monthly revenue')],
                [QUERY_B, chart('Revenue by segment')],
            ]),
            fallbackName: 'Why did revenue grow?',
        });

        expect(name).toBe('Revenue grew in spikes');
        expect(content.markdown).not.toContain('# Revenue grew in spikes');
        expect(content.markdown).toContain('\n# Growth came in spikes\n');
        expect(content.markdown).toContain('\n## Detail\n');
        expect(content.markdown).toContain('## not a heading');
        expect(content.markdown).toContain('# Conclusion');
    });

    it('places each chart as a Document chart block in reading order', () => {
        const { content } = toDeepResearchDocument({
            markdown: REPORT,
            charts: new Map([
                [QUERY_A, chart('Monthly revenue')],
                [QUERY_B, chart('Revenue by segment')],
            ]),
            fallbackName: 'Why did revenue grow?',
        });

        expect(content.markdown).not.toContain('<chart');
        expect(
            content.markdown.indexOf('<document-chart id="chart-1">'),
        ).toBeLessThan(
            content.markdown.indexOf('<document-chart id="chart-2">'),
        );
        expect(content.charts['chart-1'].chart.name).toBe('Monthly revenue');
        expect(content.charts['chart-2'].chart.name).toBe('Revenue by segment');
    });

    it('drops a chart reference without a Document chart', () => {
        const { content } = toDeepResearchDocument({
            markdown: REPORT,
            charts: new Map([[QUERY_B, chart('Revenue by segment')]]),
            fallbackName: 'Why did revenue grow?',
        });

        expect(content.markdown).not.toContain(QUERY_A);
        expect(Object.keys(content.charts)).toEqual(['chart-1']);
        expect(content.charts['chart-1'].chart.name).toBe('Revenue by segment');
    });

    it('turns report callouts into blockquotes', () => {
        const { content } = toDeepResearchDocument({
            markdown: REPORT,
            charts: new Map(),
            fallbackName: 'Why did revenue grow?',
        });

        expect(content.markdown).not.toContain('<warning');
        expect(content.markdown).toContain(
            '> **Report adjusted**\n>\n> Some chart evidence was omitted.',
        );
    });

    it('falls back to the question when the report has no title', () => {
        const { name } = toDeepResearchDocument({
            markdown: 'Revenue rose.\n\n## Growth came in spikes\n\nDetail.',
            charts: new Map(),
            fallbackName: 'Why did revenue grow?',
        });

        expect(name).toBe('Why did revenue grow?');
    });

    it('produces content the Document schema accepts', () => {
        const { content } = toDeepResearchDocument({
            markdown: REPORT,
            charts: new Map(),
            fallbackName: 'Why did revenue grow?',
        });

        expect(parseDocumentContent(2, content).markdown).toBe(
            content.markdown,
        );
    });
});
