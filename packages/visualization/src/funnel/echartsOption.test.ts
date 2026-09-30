import {
    DimensionType,
    FieldType,
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    MetricType,
    type Dimension,
    type FunnelChart,
    type ItemsMap,
    type Metric,
    type ResultRow,
} from '@lightdash/common';
import { type FunnelSeriesOption } from 'echarts';
import { describe, expect, test } from 'vitest';
import { LIGHT_VISUALIZATION_THEME } from '../theme';
import {
    getFunnelChartData,
    getFunnelColorDefaults,
    resolveFunnelChartConfig,
    resolveFunnelFieldId,
} from './config';
import { buildFunnelEchartsOption, getFunnelSeriesSort } from './echartsOption';

describe('getFunnelSeriesSort', () => {
    test('keeps the step order the query returned when steps come from rows', () => {
        expect(getFunnelSeriesSort(FunnelChartDataInput.COLUMN)).toBe('none');
    });

    test('keeps the descending taper when steps are columns, which the query sort cannot order', () => {
        expect(getFunnelSeriesSort(FunnelChartDataInput.ROW)).toBe(
            'descending',
        );
    });
});

const stageDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'stage',
    label: 'Stage',
    table: 'events',
    tableLabel: 'Events',
    sql: '${TABLE}.stage',
    hidden: false,
};

const countMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name: 'count',
    label: 'Count',
    table: 'events',
    tableLabel: 'Events',
    sql: 'COUNT(*)',
    hidden: false,
};

const revenueMetric: Metric = {
    ...countMetric,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    sql: 'SUM(${TABLE}.revenue)',
};

const itemsMap: ItemsMap = {
    events_stage: stageDimension,
    events_count: countMetric,
    events_revenue: revenueMetric,
};

const numericFields = {
    events_count: countMetric,
    events_revenue: revenueMetric,
};

const row = (stage: string, count: number, revenue: number): ResultRow => ({
    events_stage: { value: { raw: stage, formatted: stage } },
    events_count: { value: { raw: count, formatted: String(count) } },
    events_revenue: { value: { raw: revenue, formatted: String(revenue) } },
});

const rows = [
    row('Visited', 100, 5),
    row('Signed up', 40, 30),
    row('Paid', 10, 200),
];

const colorPalette = ['#111111', '#222222'];

describe('resolveFunnelFieldId', () => {
    test('keeps a field id that is still numeric', () => {
        expect(
            resolveFunnelFieldId({
                fieldId: 'events_revenue',
                allNumericFieldIds: ['events_count', 'events_revenue'],
            }),
        ).toBe('events_revenue');
    });

    test('falls back to the first numeric field', () => {
        expect(
            resolveFunnelFieldId({
                fieldId: 'gone',
                allNumericFieldIds: ['events_count', 'events_revenue'],
            }),
        ).toBe('events_count');
    });

    test('follows a renamed table calculation', () => {
        expect(
            resolveFunnelFieldId({
                fieldId: 'old_calc',
                allNumericFieldIds: ['events_count', 'new_calc'],
                tableCalculationsMetadata: [
                    { name: 'new_calc', oldName: 'old_calc' },
                ],
            }),
        ).toBe('new_calc');
    });

    test('keeps the field id when there are no numeric fields', () => {
        expect(
            resolveFunnelFieldId({ fieldId: 'x', allNumericFieldIds: [] }),
        ).toBe('x');
    });
});

describe('getFunnelChartData', () => {
    test('column input: one step per row, named by the first column', () => {
        const { data, maxValue } = getFunnelChartData({
            resultsData: { rows },
            fieldId: 'events_count',
            selectedField: countMetric,
            dataInput: FunnelChartDataInput.COLUMN,
            allNumericFieldIds: Object.keys(numericFields),
            itemsMap,
        });

        expect(maxValue).toBe(100);
        expect(
            data.map(({ id, name, value }) => ({ id, name, value })),
        ).toEqual([
            { id: 'Visited', name: 'Visited', value: 100 },
            { id: 'Signed up', name: 'Signed up', value: 40 },
            { id: 'Paid', name: 'Paid', value: 10 },
        ]);
        expect(data[0].meta.rows).toEqual([rows[0]]);
    });

    test('row input: one step per numeric field of the first row', () => {
        const { data, maxValue } = getFunnelChartData({
            resultsData: { rows },
            fieldId: 'events_count',
            selectedField: countMetric,
            dataInput: FunnelChartDataInput.ROW,
            allNumericFieldIds: Object.keys(numericFields),
            itemsMap,
        });

        expect(maxValue).toBe(100);
        expect(
            data.map(({ id, name, value }) => ({ id, name, value })),
        ).toEqual([
            { id: 'events_count', name: 'Count', value: 100 },
            { id: 'events_revenue', name: 'Revenue', value: 5 },
        ]);
        expect(data[0].meta.rows).toBe(rows);
    });

    test('no steps without results or a selected field', () => {
        expect(
            getFunnelChartData({
                resultsData: { rows: [] },
                fieldId: 'events_count',
                selectedField: countMetric,
                dataInput: FunnelChartDataInput.COLUMN,
                allNumericFieldIds: [],
                itemsMap,
            }),
        ).toEqual({ data: [], maxValue: 0 });
    });
});

describe('getFunnelColorDefaults', () => {
    test('cycles the palette by step position', () => {
        const { data } = getFunnelChartData({
            resultsData: { rows },
            fieldId: 'events_count',
            selectedField: countMetric,
            dataInput: FunnelChartDataInput.COLUMN,
            allNumericFieldIds: Object.keys(numericFields),
            itemsMap,
        });
        expect(getFunnelColorDefaults(data, colorPalette)).toEqual({
            Visited: '#111111',
            'Signed up': '#222222',
            Paid: '#111111',
        });
    });
});

describe('resolveFunnelChartConfig', () => {
    test('fills defaults and picks the first numeric field for an empty config', () => {
        const resolved = resolveFunnelChartConfig({
            chartConfig: undefined,
            resultsData: { rows },
            itemsMap,
            colorPalette,
        });

        expect(resolved.validConfig).toEqual({
            dataInput: FunnelChartDataInput.ROW,
            fieldId: 'events_count',
            labels: {
                position: FunnelChartLabelPosition.INSIDE,
                showValue: true,
                showPercentage: false,
            },
            labelOverrides: {},
            colorOverrides: {},
            showLegend: true,
            legendPosition: FunnelChartLegendPosition.HORIZONTAL,
        });
        expect(resolved.selectedField).toBe(countMetric);
        expect(resolved.data.map((d) => d.id)).toEqual([
            'events_count',
            'events_revenue',
        ]);
        expect(resolved.maxValue).toBe(100);
        expect(resolved.colorDefaults).toEqual({
            events_count: '#111111',
            events_revenue: '#222222',
        });
    });

    test('keeps a saved config and its field', () => {
        const chartConfig: FunnelChart = {
            dataInput: FunnelChartDataInput.COLUMN,
            fieldId: 'events_revenue',
            labels: { position: FunnelChartLabelPosition.LEFT },
            labelOverrides: { Paid: 'Customers' },
            colorOverrides: { Paid: '#abcdef' },
            showLegend: false,
            legendPosition: FunnelChartLegendPosition.VERTICAL,
        };

        const resolved = resolveFunnelChartConfig({
            chartConfig,
            resultsData: { rows },
            itemsMap,
            colorPalette,
            numericFields,
        });

        expect(resolved.validConfig).toEqual(chartConfig);
        expect(resolved.selectedField).toBe(revenueMetric);
        expect(resolved.data.map((d) => d.value)).toEqual([5, 30, 200]);
        expect(resolved.maxValue).toBe(200);
    });

    test('keeps the saved field while results are loading', () => {
        const resolved = resolveFunnelChartConfig({
            chartConfig: { fieldId: 'gone' },
            resultsData: undefined,
            itemsMap,
            colorPalette,
        });

        expect(resolved.validConfig.fieldId).toBe('gone');
        expect(resolved.data).toEqual([]);
    });
});

describe('buildFunnelEchartsOption', () => {
    const buildInput = (chartConfig: FunnelChart | undefined) => {
        const resolved = resolveFunnelChartConfig({
            chartConfig,
            resultsData: { rows },
            itemsMap,
            colorPalette,
        });
        return {
            validFunnelConfig: resolved.validConfig,
            data: resolved.data,
            maxValue: resolved.maxValue,
            selectedField: resolved.selectedField,
            colorDefaults: resolved.colorDefaults,
            itemsMap,
            colorPalette,
            theme: LIGHT_VISUALIZATION_THEME,
        };
    };

    test('builds the funnel series, labels, tooltip and legend', () => {
        const option = buildFunnelEchartsOption({
            ...buildInput({
                dataInput: FunnelChartDataInput.COLUMN,
                fieldId: 'events_count',
                labels: {
                    position: FunnelChartLabelPosition.INSIDE,
                    showValue: true,
                    showPercentage: true,
                },
                labelOverrides: { Paid: 'Customers' },
                colorOverrides: { Paid: '#abcdef' },
                showLegend: true,
                legendPosition: FunnelChartLegendPosition.HORIZONTAL,
            }),
            legendSelected: { Visited: false },
        });

        expect(option).toBeDefined();
        const series = (option!.series as FunnelSeriesOption[])[0];
        expect(series.type).toBe('funnel');
        expect(series.sort).toBe('none');
        expect(series.top).toBe(50);
        expect(series.color).toEqual(colorPalette);

        const data = series.data as Array<{
            name: string;
            value: number;
            itemStyle: { color: string };
            label: { backgroundColor: string };
        }>;
        expect(data.map((d) => d.name)).toEqual([
            'Visited',
            'Signed up',
            'Customers',
        ]);
        expect(data.map((d) => d.itemStyle.color)).toEqual([
            '#111111',
            '#222222',
            '#abcdef',
        ]);
        expect(data[2].label.backgroundColor).toBe('#abcdef');

        const labelFormatter = (
            series.label as { formatter: (params: unknown) => string }
        ).formatter;
        expect(labelFormatter({ name: 'Signed up', value: 40 })).toBe(
            'Signed up: 40% - 40',
        );
        expect((series.label as { color?: string }).color).toBeUndefined();

        const tooltipFormatter = (
            series.tooltip as { formatter: (params: unknown) => string }
        ).formatter;
        expect(
            tooltipFormatter({
                color: '#222222',
                name: 'Signed up',
                value: 40,
            }),
        ).toContain('40% - 40');

        expect(option!.legend).toMatchObject({
            show: true,
            orient: FunnelChartLegendPosition.HORIZONTAL,
            type: 'scroll',
            left: 'center',
            top: 'top',
            selected: { Visited: false },
        });
        expect(option!.textStyle).toEqual({
            fontFamily: LIGHT_VISUALIZATION_THEME.chartFont,
        });
        expect(option!.animation).toBe(true);
    });

    test('outside labels take the foreground color and the vertical legend sits left', () => {
        const option = buildFunnelEchartsOption({
            ...buildInput({
                dataInput: FunnelChartDataInput.ROW,
                fieldId: 'events_count',
                labels: { position: FunnelChartLabelPosition.RIGHT },
                showLegend: true,
                legendPosition: FunnelChartLegendPosition.VERTICAL,
            }),
            animation: false,
        });

        const series = (option!.series as FunnelSeriesOption[])[0];
        expect(series.sort).toBe('descending');
        expect(series.top).toBe(20);
        expect(series.label).toMatchObject({
            show: true,
            position: FunnelChartLabelPosition.RIGHT,
            color: LIGHT_VISUALIZATION_THEME.foreground,
        });
        expect(option!.legend).toMatchObject({
            orient: FunnelChartLegendPosition.VERTICAL,
            left: 'left',
            top: 'middle',
            align: 'left',
        });
        expect(option!.animation).toBe(false);
    });

    test('returns undefined without a config, steps or items', () => {
        expect(
            buildFunnelEchartsOption({
                ...buildInput(undefined),
                validFunnelConfig: undefined,
            }),
        ).toBeUndefined();
        expect(
            buildFunnelEchartsOption({ ...buildInput(undefined), data: [] }),
        ).toBeUndefined();
        expect(
            buildFunnelEchartsOption({
                ...buildInput(undefined),
                itemsMap: undefined,
            }),
        ).toBeUndefined();
    });
});
