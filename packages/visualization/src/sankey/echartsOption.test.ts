import {
    FieldType,
    MetricType,
    type Metric,
    type ResultRow,
    type SankeyChart,
} from '@lightdash/common';
import { type SankeySeriesOption } from 'echarts';
import { describe, expect, test } from 'vitest';
import { LIGHT_VISUALIZATION_THEME } from '../theme';
import { buildSankeyEchartsOption } from './echartsOption';
import { transformSankeyData } from './transform';

const amount: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
};

const cell = (formatted: string, raw: unknown = formatted) => ({
    value: { raw, formatted },
});

const row = (source: string, target: string, value: number): ResultRow => ({
    orders_from: cell(source),
    orders_to: cell(target),
    orders_amount: cell(String(value), value),
});

const FIELDS = {
    sourceFieldId: 'orders_from',
    targetFieldId: 'orders_to',
    metricFieldId: 'orders_amount',
};

const validSankeyConfig: SankeyChart = {
    ...FIELDS,
    nodeAlign: 'justify',
    orient: 'horizontal',
    nodeLayout: 'multi-step',
};

const data = transformSankeyData(
    [row('A', 'B', 10), row('A', 'C', 5), row('B', 'D', 7)],
    FIELDS,
    { nodeLayout: 'multi-step' },
);

const colorPalette = ['#111111', '#222222'];

const build = (
    overrides: Partial<Parameters<typeof buildSankeyEchartsOption>[0]> = {},
) =>
    buildSankeyEchartsOption({
        validSankeyConfig,
        data,
        numericFields: { orders_amount: amount },
        resultsData: undefined,
        itemsMap: undefined,
        colorPalette,
        theme: LIGHT_VISUALIZATION_THEME,
        ...overrides,
    });

describe('buildSankeyEchartsOption', () => {
    test('is undefined without a config or without links', () => {
        expect(build({ validSankeyConfig: undefined })).toBeUndefined();
        expect(
            build({
                data: { nodes: [], links: [], maxDepth: 0, hasCycle: false },
            }),
        ).toBeUndefined();
    });

    test('builds one sankey series colored per depth', () => {
        const option = build();
        expect(option).toBeDefined();
        const series = (option!.series as SankeySeriesOption[])[0];

        expect(series.type).toBe('sankey');
        expect(series.nodeAlign).toBe('justify');
        expect(series.orient).toBe('horizontal');
        expect(series.right).toBe('14%');
        expect(series.bottom).toBe('2%');
        expect(series.data).toHaveLength(4);
        expect(series.links).toHaveLength(3);
        expect(series.levels?.map((l) => l.itemStyle?.color)).toEqual([
            '#111111',
            '#222222',
            '#111111',
        ]);
        expect(option!.animation).toBe(true);
        expect(option!.textStyle?.fontFamily).toBe(
            LIGHT_VISUALIZATION_THEME.chartFont,
        );
    });

    test('lays a vertical chart out with the labels below', () => {
        const option = build({
            validSankeyConfig: { ...validSankeyConfig, orient: 'vertical' },
        });
        const series = (option!.series as SankeySeriesOption[])[0];

        expect(series.orient).toBe('vertical');
        expect(series.bottom).toBe('14%');
        expect(series.right).toBe('1%');
        expect(series.label).toMatchObject({
            position: 'bottom',
            color: LIGHT_VISUALIZATION_THEME.foreground,
        });
    });

    test('disables animation in a dashboard or a minimal render', () => {
        expect(build({ animation: false })!.animation).toBe(false);
        expect(build({ animation: false })!.animation).toBe(false);
    });

    test('formats link tooltips with the node labels and the metric value', () => {
        const direct = transformSankeyData([row('A', 'B', 10)], FIELDS, {
            nodeLayout: 'direct',
        });
        const option = build({ data: direct });
        const formatter = (option!.tooltip as { formatter: Function })
            .formatter;

        const edge = formatter({
            dataType: 'edge',
            value: 10,
            color: '#111111',
            data: { source: 'source:A', target: 'target:B' },
        });
        expect(edge).toContain('A → B');
        expect(edge).toContain('#111111');
        expect(edge).toContain('10');

        const node = formatter({
            dataType: 'node',
            name: 'source:A',
            color: '#111111',
        });
        expect(node).toContain('>A<');
    });
});
