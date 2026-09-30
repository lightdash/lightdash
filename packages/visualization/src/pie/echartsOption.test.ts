import { type PieSeriesOption } from 'echarts';
import { describe, expect, test } from 'vitest';
import { LEGEND_INTERACTION_HINT } from '../cartesian/legendTooltip';
import { LIGHT_VISUALIZATION_THEME } from '../theme';
import { resolvePieChartConfig } from './config';
import { buildPieEchartsOption } from './echartsOption';
import { PIE_ITEMS_MAP, PIE_ROWS } from './fixtures.mock';

/** The object form of a pie data point; the ECharts type is a wide union. */
type PieSlice = {
    name?: string;
    value?: number;
    itemStyle?: { color?: string; borderRadius?: number };
    label?: { show?: boolean; formatter?: unknown };
    meta: { rows: unknown[] };
};

const slicesOf = (option: ReturnType<typeof buildPieEchartsOption>) =>
    option!.pieSeriesOption.data as unknown as PieSlice[];

const colorPalette = ['#111111', '#222222'];
const getGroupColor = (groupPrefix: string, identifier: string) =>
    `${groupPrefix}/${identifier}`;

const resolve = (chartConfig = {}) =>
    resolvePieChartConfig({
        chartConfig,
        resultsData: { rows: PIE_ROWS },
        itemsMap: PIE_ITEMS_MAP,
        colorPalette,
    });

describe('buildPieEchartsOption', () => {
    test('builds one sorted slice per group with the group color', () => {
        const option = buildPieEchartsOption({
            pieChartConfig: resolve({
                groupSortOverrides: ['pending', 'cancelled', 'completed'],
            }),
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            getGroupColor,
            theme: LIGHT_VISUALIZATION_THEME,
        });

        expect(option).toBeDefined();
        const data = slicesOf(option);
        expect(data.map((slice) => slice.name)).toEqual([
            'pending',
            'cancelled',
            'completed',
        ]);
        expect(data.map((slice) => slice.value)).toEqual([30, 20, 150]);
        expect(data[2].itemStyle?.color).toBe('orders_status/completed');
        expect(data[2].meta.rows).toHaveLength(2);
        expect(option!.pieSeriesOption.radius).toEqual(['30%', '70%']);
        expect(option!.eChartsOption.series).toEqual([option!.pieSeriesOption]);
        expect(option!.eChartsOption.animation).toBe(true);
    });

    test('applies label, color and value overrides per slice', () => {
        const option = buildPieEchartsOption({
            pieChartConfig: resolve({
                isDonut: false,
                valueLabel: 'inside',
                showValue: true,
                showPercentage: false,
                groupLabelOverrides: { completed: 'Done' },
                groupColorOverrides: { completed: '#00ff00' },
                groupValueOptionOverrides: {
                    pending: { valueLabel: 'hidden' },
                },
            }),
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            getGroupColor,
            theme: LIGHT_VISUALIZATION_THEME,
            minimal: true,
        });

        const data = slicesOf(option);
        const [completed, pending] = data;
        expect(completed.name).toBe('Done');
        expect(completed.itemStyle?.color).toBe('#00ff00');
        expect(completed.itemStyle?.borderRadius).toBe(0);
        expect(completed.label?.show).toBe(true);
        expect(pending.label?.show).toBe(false);
        expect(option!.pieSeriesOption.radius).toBe('70%');
        expect(option!.eChartsOption.animation).toBe(false);

        const formatter = completed.label?.formatter;
        expect(typeof formatter).toBe('function');
        expect(
            (formatter as (params: unknown) => string)({
                name: 'Done',
                percent: 75,
            }),
        ).toBe('Done: 150');
    });

    test('places the legend and passes the selection and the double click hint', () => {
        const option = buildPieEchartsOption({
            pieChartConfig: resolve({ legendPosition: 'vertical' }),
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            getGroupColor,
            theme: LIGHT_VISUALIZATION_THEME,
            legendSelected: { pending: false },
            isInDashboard: true,
        });

        const legend = option!.eChartsOption.legend as Record<string, unknown>;
        expect(legend.orient).toBe('vertical');
        expect(legend.left).toBe('left');
        expect(legend.selected).toEqual({ pending: false });
        expect(
            (legend.tooltip as { formatter: () => string }).formatter(),
        ).toBe(LEGEND_INTERACTION_HINT);
        expect(option!.eChartsOption.textStyle?.fontFamily).toBe(
            LIGHT_VISUALIZATION_THEME.chartFont,
        );
        expect(option!.eChartsOption.animation).toBe(false);
    });

    test('formats the tooltip with the percentage and the formatted value', () => {
        const option = buildPieEchartsOption({
            pieChartConfig: resolve(),
            resultsData: { rows: PIE_ROWS },
            itemsMap: PIE_ITEMS_MAP,
            getGroupColor,
            theme: LIGHT_VISUALIZATION_THEME,
        });

        const tooltip = option!.pieSeriesOption.tooltip as NonNullable<
            PieSeriesOption['tooltip']
        >;
        const formatter = tooltip.formatter as (params: unknown) => string;
        const html = formatter({
            color: '#00ff00',
            name: 'completed',
            value: 150,
            percent: 75,
        });
        expect(html).toContain('completed');
        expect(html).toContain('75% - 150');
        expect(html).toContain('#00ff00');
    });

    test('returns undefined without fields, a metric or slices', () => {
        expect(
            buildPieEchartsOption({
                pieChartConfig: resolve(),
                resultsData: { rows: PIE_ROWS },
                itemsMap: undefined,
                getGroupColor,
                theme: LIGHT_VISUALIZATION_THEME,
            }),
        ).toBeUndefined();
        expect(
            buildPieEchartsOption({
                pieChartConfig: undefined,
                resultsData: { rows: PIE_ROWS },
                itemsMap: PIE_ITEMS_MAP,
                getGroupColor,
                theme: LIGHT_VISUALIZATION_THEME,
            }),
        ).toBeUndefined();
        expect(
            buildPieEchartsOption({
                pieChartConfig: resolvePieChartConfig({
                    chartConfig: {},
                    resultsData: { rows: [] },
                    itemsMap: PIE_ITEMS_MAP,
                    colorPalette,
                }),
                resultsData: { rows: [] },
                itemsMap: PIE_ITEMS_MAP,
                getGroupColor,
                theme: LIGHT_VISUALIZATION_THEME,
            }),
        ).toBeUndefined();
    });
});
