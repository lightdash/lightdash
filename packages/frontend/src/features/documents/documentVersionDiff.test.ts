import {
    ChartKind,
    ChartType,
    type DocumentSemanticChartContent,
    type DocumentSqlChartContent,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    diffDocumentVersions,
    diffLines,
    withContext,
} from './documentVersionDiff';

const chart = (
    name: string,
    overrides: Partial<DocumentSemanticChartContent['chart']> = {},
): DocumentSemanticChartContent => ({
    source: 'semantic',
    chart: {
        name,
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.TABLE },
        ...overrides,
    },
});

const tag = (id: string) => `<document-chart id="${id}">`;

describe('diffLines', () => {
    it('keeps shared lines and marks the rest as removed or added', () => {
        expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
            { type: 'unchanged', text: 'a' },
            { type: 'removed', text: 'b' },
            { type: 'added', text: 'x' },
            { type: 'unchanged', text: 'c' },
        ]);
    });

    it('handles repeated lines deterministically', () => {
        const changes = diffLines(['x', 'x', 'y'], ['x', 'y', 'x']);
        expect(changes.filter((line) => line.type !== 'unchanged')).toEqual([
            { type: 'removed', text: 'x' },
            { type: 'added', text: 'x' },
        ]);
        expect(diffLines(['x', 'x', 'y'], ['x', 'y', 'x'])).toEqual(changes);
    });

    it('reports nothing for identical text', () => {
        expect(
            diffLines(['a', '', 'b'], ['a', '', 'b']).every(
                (line) => line.type === 'unchanged',
            ),
        ).toBe(true);
    });
});

describe('diffDocumentVersions', () => {
    const revenue = chart('Revenue');
    const payments = chart('Payments', {
        metricQuery: { ...revenue.chart.metricQuery, metrics: ['amount'] },
    });
    const users = chart('Users');
    const before = {
        markdown: [
            '# Review',
            'Revenue grew 18%.',
            tag('c1'),
            tag('c2'),
            tag('c3'),
            '> Draft',
        ].join('\n\n'),
        charts: { c1: revenue, c2: payments, c3: users },
    };

    it('finds no changes between identical versions', () => {
        const diff = diffDocumentVersions(before, before);
        expect(diff.hasChanges).toBe(false);
        expect(diff.charts.map((change) => change.kind)).toEqual([
            'unchanged',
            'unchanged',
            'unchanged',
        ]);
    });

    it('reports text edits without the chart tags', () => {
        const diff = diffDocumentVersions(before, {
            ...before,
            markdown: before.markdown.replace('18%', '21%'),
        });
        expect(diff.text.filter((line) => line.type !== 'unchanged')).toEqual([
            { type: 'removed', text: 'Revenue grew 18%.' },
            { type: 'added', text: 'Revenue grew 21%.' },
        ]);
        expect(
            diff.text.some((line) => line.text.includes('<document-chart')),
        ).toBe(false);
    });

    it('reports added, removed, changed and moved charts in current order', () => {
        const renamed = chart('Payments (Q3)', {
            metricQuery: { ...payments.chart.metricQuery, limit: 10 },
        });
        const spend = chart('Spend');
        const diff = diffDocumentVersions(before, {
            markdown: [
                '# Review',
                'Revenue grew 18%.',
                tag('c2'),
                tag('c1'),
                tag('c4'),
                '> Draft',
            ].join('\n\n'),
            charts: { c1: revenue, c2: renamed, c4: spend },
        });
        expect(diff.hasChanges).toBe(true);
        expect(diff.charts).toEqual([
            {
                kind: 'changed',
                name: 'Payments (Q3)',
                beforePosition: 2,
                afterPosition: 1,
                moved: false,
                changedParts: ['Title', 'Row limit'],
            },
            {
                kind: 'unchanged',
                name: 'Revenue',
                beforePosition: 1,
                afterPosition: 2,
                // Of two swapped charts, the first one is reported as moved
                moved: true,
                changedParts: [],
            },
            {
                kind: 'added',
                name: 'Spend',
                beforePosition: null,
                afterPosition: 3,
                moved: false,
                changedParts: [],
            },
            {
                kind: 'removed',
                name: 'Users',
                beforePosition: 3,
                afterPosition: null,
                moved: false,
                changedParts: [],
            },
        ]);
    });

    it('pairs identical charts even when their ids were assigned by position', () => {
        const diff = diffDocumentVersions(before, {
            markdown: [tag('c1'), tag('c2')].join('\n\n'),
            charts: { c1: payments, c2: users },
        });
        expect(
            diff.charts.map(({ kind, name, moved }) => ({ kind, name, moved })),
        ).toEqual([
            { kind: 'unchanged', name: 'Payments', moved: false },
            { kind: 'unchanged', name: 'Users', moved: false },
            { kind: 'removed', name: 'Revenue', moved: false },
        ]);
    });

    it('pairs repeated identical charts one to one', () => {
        const doubled = {
            markdown: [tag('c1'), tag('c2')].join('\n\n'),
            charts: { c1: revenue, c2: revenue },
        };
        const diff = diffDocumentVersions(doubled, {
            markdown: tag('c1'),
            charts: { c1: revenue },
        });
        expect(diff.charts.map((change) => change.kind)).toEqual([
            'unchanged',
            'removed',
        ]);
    });

    it('names a chart type change without repeating its visualization settings', () => {
        const diff = diffDocumentVersions(
            { markdown: tag('c1'), charts: { c1: revenue } },
            {
                markdown: tag('c1'),
                charts: {
                    c1: chart('Revenue', {
                        chartConfig: { type: ChartType.BIG_NUMBER },
                    }),
                },
            },
        );
        expect(diff.charts[0].changedParts).toEqual(['Chart type']);
    });

    it('falls back to query settings for changes outside the named parts', () => {
        const diff = diffDocumentVersions(
            { markdown: tag('c1'), charts: { c1: revenue } },
            {
                markdown: tag('c1'),
                charts: {
                    c1: chart('Revenue', {
                        metricQuery: {
                            ...revenue.chart.metricQuery,
                            timezone: 'Europe/London',
                        },
                    }),
                },
            },
        );
        expect(diff.charts[0].changedParts).toEqual(['Query settings']);
    });
});

const unchanged = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
        type: 'unchanged' as const,
        text: `line ${index}`,
    }));

describe('withContext', () => {
    it('collapses long unchanged runs away from changes', () => {
        const shown = withContext([
            { type: 'added', text: 'new' },
            ...unchanged(10),
        ]);
        expect(shown).toEqual([
            { kind: 'line', type: 'added', text: 'new' },
            { kind: 'line', type: 'unchanged', text: 'line 0' },
            { kind: 'line', type: 'unchanged', text: 'line 1' },
            { kind: 'skipped', count: 8 },
        ]);
    });

    it('shows short unchanged runs instead of collapsing them', () => {
        const shown = withContext([
            { type: 'removed', text: 'old' },
            ...unchanged(6),
            { type: 'added', text: 'new' },
        ]);
        expect(shown.some((line) => line.kind === 'skipped')).toBe(false);
        expect(shown).toHaveLength(8);
    });
});

describe('content from a newer release', () => {
    const image = { source: 'image', image: { url: 'logo.png' } };
    const block = '<saved-chart slug="monthly-revenue">';
    const before = {
        markdown: [tag('c1'), tag('c2'), 'Text'].join('\n\n'),
        charts: { c1: chart('Orders') },
        unsupportedCharts: { c2: image },
    };

    it('pairs an unchanged unsupported chart and lists one that was added', () => {
        const after = {
            ...before,
            markdown: [tag('c1'), tag('c2'), 'Text', tag('c3'), block].join(
                '\n\n',
            ),
            unsupportedCharts: { c2: image, c3: { source: 'video' } },
        };
        const diff = diffDocumentVersions(before, after);
        expect(diff.charts.map(({ kind, name }) => ({ kind, name }))).toEqual([
            { kind: 'unchanged', name: 'Orders' },
            { kind: 'unchanged', name: 'Chart from a newer version' },
            { kind: 'added', name: 'Chart from a newer version' },
        ]);
        expect(diff.text).toContainEqual({ type: 'added', text: block });
    });
});

describe('SQL charts', () => {
    const sqlChart: DocumentSqlChartContent = {
        source: 'sql',
        chart: {
            name: 'Orders by status',
            sql: 'select status, count(*) from orders group by 1',
            limit: 100,
            chartKind: ChartKind.TABLE,
            config: {
                type: ChartKind.TABLE,
                metadata: { version: 1 },
                columns: {},
                display: undefined,
            },
        },
    };
    const withSql = (chart: DocumentSqlChartContent) => ({
        markdown: tag('c1'),
        charts: { c1: chart },
    });

    it('names the SQL and row limit when they change', () => {
        const diff = diffDocumentVersions(
            withSql(sqlChart),
            withSql({
                ...sqlChart,
                chart: { ...sqlChart.chart, sql: 'select 1', limit: 10 },
            }),
        );
        expect(diff.charts).toEqual([
            expect.objectContaining({
                kind: 'changed',
                changedParts: ['SQL', 'Row limit'],
            }),
        ]);
    });
});
