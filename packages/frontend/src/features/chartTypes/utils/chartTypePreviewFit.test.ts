import { type DataAppVizField, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dataAppVizFieldPoolsFromMetricQuery } from './autoMapDataAppVizFields';
import {
    chartTypeFitDetail,
    chartTypeFitHeadline,
    chartTypeFitSummary,
    checkChartTypeFit,
} from './chartTypePreviewFit';

const sankeyFields: DataAppVizField[] = [
    { name: 'source', label: 'Source', type: 'dimension', required: true },
    { name: 'target', label: 'Target', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const metricQuery = (dimensions: string[], metrics: string[]): MetricQuery => ({
    exploreName: 'customers',
    dimensions,
    metrics,
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

const poolsOf = (dimensions: string[], metrics: string[]) =>
    dataAppVizFieldPoolsFromMetricQuery(metricQuery(dimensions, metrics));

describe('checkChartTypeFit', () => {
    it('accepts a Sankey bound to two dimensions and a metric', () => {
        const pools = poolsOf(['channel', 'plan'], ['customer_count']);

        expect(
            checkChartTypeFit(
                sankeyFields,
                {
                    source: 'channel',
                    target: 'plan',
                    value: 'customer_count',
                },
                pools,
            ),
        ).toEqual([]);
    });

    it('reports a metric input bound to a dimension', () => {
        const pools = poolsOf(['channel', 'plan'], []);

        const issues = checkChartTypeFit(
            sankeyFields,
            { source: 'channel', target: 'plan', value: 'plan' },
            pools,
        );

        expect(issues).toEqual([
            {
                fieldName: 'value',
                label: 'Value',
                expects: 'metric',
                mapped: { fieldId: 'plan', kind: 'dimension' },
            },
        ]);
        expect(chartTypeFitHeadline(issues[0])).toBe('Value needs a metric.');
        expect(chartTypeFitDetail(issues[0], 'Plan')).toBe(
            'Plan is a dimension, so the chart has no value to size itself by.',
        );
    });

    it('reports every required input left unbound', () => {
        const pools = poolsOf([], ['revenue']);

        const issues = checkChartTypeFit(
            sankeyFields,
            { value: 'revenue' },
            pools,
        );

        expect(issues.map((issue) => issue.fieldName)).toEqual([
            'source',
            'target',
        ]);
        expect(issues[0].mapped).toBeNull();
        expect(chartTypeFitDetail(issues[0], null)).toBe(
            'Nothing is bound to Source yet.',
        );
    });

    it('accepts a chart type that declares no metric input', () => {
        const fields: DataAppVizField[] = [
            {
                name: 'label',
                label: 'Label',
                type: 'dimension',
                required: true,
            },
        ];

        expect(
            checkChartTypeFit(
                fields,
                { label: 'channel' },
                poolsOf(['channel'], []),
            ),
        ).toEqual([]);
    });

    it('accepts a table calculation in a metric input', () => {
        const query: MetricQuery = {
            ...metricQuery(['channel', 'plan'], []),
            tableCalculations: [
                { name: 'share', displayName: 'Share', sql: '1' },
            ],
        };

        expect(
            checkChartTypeFit(
                sankeyFields,
                { source: 'channel', target: 'plan', value: 'share' },
                dataAppVizFieldPoolsFromMetricQuery(query),
            ),
        ).toEqual([]);
    });

    it('leaves an optional input empty without complaint', () => {
        const fields: DataAppVizField[] = [
            {
                name: 'label',
                label: 'Label',
                type: 'dimension',
                required: true,
            },
            { name: 'size', label: 'Size', type: 'metric', required: false },
        ];

        expect(
            checkChartTypeFit(
                fields,
                { label: 'channel' },
                poolsOf(['channel'], []),
            ),
        ).toEqual([]);
    });

    it('lets a column input take either kind of field', () => {
        const fields: DataAppVizField[] = [
            { name: 'any', label: 'Any', type: 'column', required: true },
        ];
        const pools = poolsOf(['channel'], ['revenue']);

        expect(checkChartTypeFit(fields, { any: 'channel' }, pools)).toEqual(
            [],
        );
        expect(checkChartTypeFit(fields, { any: 'revenue' }, pools)).toEqual(
            [],
        );
    });
});

describe('chartTypeFitSummary', () => {
    it('says a chart fits when nothing is wrong', () => {
        expect(chartTypeFitSummary([], poolsOf(['channel'], ['revenue']))).toBe(
            'Fits',
        );
    });

    it('names a query with no dimensions', () => {
        const pools = poolsOf([], ['revenue']);
        const issues = checkChartTypeFit(sankeyFields, {}, pools);

        expect(chartTypeFitSummary(issues, pools)).toBe('No dimensions');
    });

    it('names a query missing a metric', () => {
        const pools = poolsOf(['channel', 'plan'], []);
        const issues = checkChartTypeFit(
            sankeyFields,
            { source: 'channel', target: 'plan' },
            pools,
        );

        expect(chartTypeFitSummary(issues, pools)).toBe('Needs a metric');
    });
});
