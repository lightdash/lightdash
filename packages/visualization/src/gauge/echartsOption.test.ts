import {
    FieldType,
    MetricType,
    type ItemsMap,
    type Metric,
    type ResultRow,
} from '@lightdash/common';
import { type GaugeSeriesOption } from 'echarts';
import { describe, expect, test } from 'vitest';
import { DARK_VISUALIZATION_THEME, LIGHT_VISUALIZATION_THEME } from '../theme';
import {
    buildGaugeEchartsOption,
    getGaugeValueColor,
    lightenColor,
} from './echartsOption';

const revenue: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
} as Metric;

const target: Metric = { ...revenue, name: 'target', label: 'Target' };

const itemsMap: ItemsMap = {
    orders_revenue: revenue,
    orders_target: target,
};

const rows: ResultRow[] = [
    {
        orders_revenue: { value: { raw: 75, formatted: '75' } },
        orders_target: { value: { raw: 200, formatted: '200' } },
    },
];

const sizes = {
    tileFontSize: 20,
    detailsFontSize: 40,
    lineSize: 30,
    radius: 90,
};

const sections = [
    { min: 0, max: 50, color: '#ff0000' },
    { min: 50, max: 100, color: '#00ff00' },
];

describe('lightenColor', () => {
    test('mixes a hex color towards white like Mantine', () => {
        expect(lightenColor('#000000', 0.5)).toBe('rgba(128, 128, 128, 1)');
        expect(lightenColor('#fafafa', 0.5)).toBe('rgba(253, 253, 253, 1)');
        expect(lightenColor('#abc', 0)).toBe('rgba(170, 187, 204, 1)');
    });

    test('keeps the alpha of an rgba color', () => {
        expect(lightenColor('rgba(0, 0, 0, 0.4)', 1)).toBe(
            'rgba(255, 255, 255, 0.4)',
        );
    });
});

describe('getGaugeValueColor', () => {
    const base = {
        primaryColor: '#0000ff',
        foregroundColor: '#111111',
        gaugeMax: 100,
    };

    test('uses the primary color without sections', () => {
        expect(
            getGaugeValueColor({ ...base, numericValue: 10, sections: [] }),
        ).toStrictEqual({ text: '#111111', bar: '#0000ff' });
    });

    test('uses the color of the section holding the value', () => {
        expect(
            getGaugeValueColor({ ...base, numericValue: 60, sections }),
        ).toStrictEqual({ text: '#00ff00', bar: '#00ff00' });
    });

    test('uses the last section above the gauge max', () => {
        expect(
            getGaugeValueColor({ ...base, numericValue: 150, sections }),
        ).toStrictEqual({ text: '#00ff00', bar: '#00ff00' });
    });

    test('falls back to the defaults in a gap', () => {
        expect(
            getGaugeValueColor({
                ...base,
                numericValue: 30,
                sections: [{ min: 50, max: 100, color: '#00ff00' }],
            }),
        ).toStrictEqual({ text: '#111111', bar: '#0000ff' });
    });
});

describe('buildGaugeEchartsOption', () => {
    const build = (
        overrides: Partial<Parameters<typeof buildGaugeEchartsOption>[0]>,
    ) =>
        buildGaugeEchartsOption({
            validGaugeConfig: { selectedField: 'orders_revenue', sections },
            itemsMap,
            resultsData: { rows },
            theme: LIGHT_VISUALIZATION_THEME,
            ...sizes,
            ...overrides,
        });

    test('returns undefined without a config, rows or a known field', () => {
        expect(build({ validGaugeConfig: undefined })).toBeUndefined();
        expect(build({ resultsData: { rows: [] } })).toBeUndefined();
        expect(build({ itemsMap: undefined })).toBeUndefined();
        expect(
            build({ validGaugeConfig: { selectedField: 'missing' } }),
        ).toBeUndefined();
    });

    test('builds a section series and a main series from the first row', () => {
        const option = build({});
        expect(option).toBeDefined();
        expect(option?.animation).toBe(true);
        expect(option?.textStyle).toStrictEqual({
            fontFamily: 'Inter, sans-serif',
        });

        const [sectionSeries, mainSeries] =
            option?.series as GaugeSeriesOption[];
        expect(sectionSeries.zlevel).toBe(2);
        // The gap check compares the raw section min with the normalized
        // previous threshold, so a section starting at 50 adds a zero-width
        // gap before it.
        expect(sectionSeries.axisLine?.lineStyle?.color).toStrictEqual([
            [0.5, '#ff0000'],
            [0.5, 'transparent'],
            [1, '#00ff00'],
        ]);
        expect(sectionSeries.progress?.itemStyle?.borderColor).toBe('white');

        expect(mainSeries.min).toBe(0);
        expect(mainSeries.max).toBe(100);
        expect(mainSeries.radius).toBe('90%');
        expect(mainSeries.data).toStrictEqual([{ value: 75, name: 'Revenue' }]);
        expect(mainSeries.progress?.itemStyle?.color).toBe('#00ff00');
        expect(mainSeries.axisLine?.lineStyle?.color).toStrictEqual([
            [1, LIGHT_VISUALIZATION_THEME.neutral[2]],
        ]);
        expect(mainSeries.detail?.rich?.percentage?.backgroundColor).toBe(
            lightenColor(LIGHT_VISUALIZATION_THEME.neutral[0], 0.5),
        );
    });

    test('takes the max from a field and formats the percentage', () => {
        const option = build({
            validGaugeConfig: {
                selectedField: 'orders_revenue',
                maxFieldId: 'orders_target',
                showPercentage: true,
                customPercentageLabel: 'of target',
                customLabel: 'Sales',
            },
        });
        const [sectionSeries, mainSeries] =
            option?.series as GaugeSeriesOption[];
        expect(mainSeries.max).toBe(200);
        expect(mainSeries.data).toStrictEqual([{ value: 75, name: 'Sales' }]);
        expect(sectionSeries.axisLine?.lineStyle?.color).toStrictEqual([
            [1, 'transparent'],
        ]);
        const formatter = mainSeries.detail?.formatter as (
            value: number,
        ) => string;
        expect(formatter(75)).toBe(
            '{value|75}\n{percentage|38%}{percentageLabel| of target}',
        );
    });

    test('disables animation in a dashboard and uses the dark border', () => {
        const option = build({
            animation: false,
            theme: DARK_VISUALIZATION_THEME,
        });
        expect(option?.animation).toBe(false);
        const [sectionSeries, mainSeries] =
            option?.series as GaugeSeriesOption[];
        expect(sectionSeries.progress?.itemStyle?.borderColor).toBe(
            DARK_VISUALIZATION_THEME.chrome[6],
        );
        expect(mainSeries.detail?.rich?.percentage?.backgroundColor).toBe(
            DARK_VISUALIZATION_THEME.contrast[4],
        );
    });
});
