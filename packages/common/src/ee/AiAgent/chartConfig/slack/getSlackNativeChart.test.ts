import { DimensionType } from '../../../../types/field';
import { type ResultColumn } from '../../../../types/results';
import { TimeFrames } from '../../../../types/timeFrames';
import { getComposerSlackRunQueryChart } from '../../composerChartVizConfig';
import {
    composerChartVizConfigSchemaPersisted,
    type ComposerBuiltinChartVizConfig,
    type ToolRunQueryArgsTransformed,
} from '../../schemas';
import {
    getSlackNativeChart,
    type SlackNativeChartRoute,
} from './getSlackNativeChart';
import { type GetPivotedResultsFn } from './types';

const columns: ResultColumn[] = [
    {
        reference: 'month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    {
        reference: 'year',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.YEAR,
    },
    { reference: 'day', type: DimensionType.DATE },
    { reference: 'created_at', type: DimensionType.TIMESTAMP },
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'orders', type: DimensionType.NUMBER, label: 'Orders' },
    { reference: 'revenue', type: DimensionType.NUMBER, label: 'Revenue' },
];

// One series per (metric, group value), labelled like the DuckDB pivot.
const getPivotedResults: GetPivotedResultsFn = async (
    rows,
    _fields,
    pivotFields,
    metrics,
) => {
    const [pivot] = pivotFields;
    const keys = new Map<string, string>();
    const byIndex = new Map<string, Record<string, unknown>>();
    rows.forEach((row) => {
        const index = Object.entries(row)
            .filter(([key]) => key !== pivot && !metrics.includes(key))
            .map(([, value]) => String(value))
            .join('|');
        const target =
            byIndex.get(index) ??
            Object.fromEntries(
                Object.entries(row).filter(
                    ([key]) => key !== pivot && !metrics.includes(key),
                ),
            );
        byIndex.set(index, target);
        metrics.forEach((metric, metricIndex) => {
            const key =
                metrics.length > 1
                    ? `${String(row[pivot])}_${metricIndex}`
                    : String(row[pivot]);
            keys.set(
                key,
                metrics.length > 1
                    ? `${metric} ${String(row[pivot])}`
                    : String(row[pivot]),
            );
            target[key] = row[metric];
        });
    });
    return {
        results: [...byIndex.values()],
        metrics: [...keys.keys()],
        secondaryMetrics: [],
        labels: Object.fromEntries(keys),
    };
};

const route = async (
    viz: Partial<ComposerBuiltinChartVizConfig> &
        Pick<ComposerBuiltinChartVizConfig, 'type'>,
    rows: Record<string, unknown>[],
    title = 'Orders',
): Promise<SlackNativeChartRoute> => {
    const chart = getComposerSlackRunQueryChart({
        columns,
        rows,
        vizConfig: composerChartVizConfigSchemaPersisted.parse({
            x: 'status',
            y: ['orders'],
            groupBy: null,
            stack: null,
            horizontal: null,
            y2: null,
            labels: null,
            ...viz,
        }),
        metadata: { title, description: '' },
    });
    if (!chart) throw new Error('not a Slack image chart');
    return getSlackNativeChart({
        queryTool: chart.tool,
        queryResults: { rows: chart.rows, fields: chart.fields },
        getPivotedResults,
        blockId: 'native',
    });
};

const statusRows = [
    { status: 'placed', orders: 3 },
    { status: 'shipped', orders: '5' },
    { status: 'returned', orders: 0.5 },
];
const monthRows = (statuses: string[], months = 3) =>
    Array.from({ length: months }, (_, month) =>
        statuses.map((status, index) => ({
            month: `2024-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`,
            status,
            orders: month + index,
            revenue: (month + index) * 10,
        })),
    )
        .flat()
        .reverse();
const categories = (count: number, label = (i: number) => `c${i}`) =>
    Array.from({ length: count }, (_, i) => ({ status: label(i), orders: i }));

describe('getSlackNativeChart', () => {
    it('builds a single-series bar in row order with coerced values', async () => {
        expect(
            await route(
                { type: 'bar', labels: { x: 'Status', y: '', y2: null } },
                statusRows,
            ),
        ).toEqual({
            route: 'native',
            block: {
                type: 'data_visualization',
                block_id: 'native',
                title: 'Orders',
                chart: {
                    type: 'bar',
                    series: [
                        {
                            name: 'Orders',
                            data: [
                                { label: 'placed', value: 3 },
                                { label: 'shipped', value: 5 },
                                { label: 'returned', value: 0.5 },
                            ],
                        },
                    ],
                    axis_config: {
                        categories: ['placed', 'shipped', 'returned'],
                        x_label: 'Status',
                    },
                },
            },
        });
    });

    it('passes values through unrounded', async () => {
        const values = [0.1 + 0.2, 0.00006, 12345678901234.25, -45000.5];
        const result = await route(
            { type: 'bar' },
            [...values, '9007199254740'].map((orders, index) => ({
                status: `s${index}`,
                orders,
            })),
        );
        expect(
            result.route === 'native' &&
                result.block.chart.series[0].data.map(({ value }) => value),
        ).toEqual([...values, 9007199254740]);
    });

    it('splits a grouped bar into one series per group', async () => {
        const result = await route(
            { type: 'bar', x: 'month', groupBy: ['status'] },
            monthRows(['placed', 'shipped']),
        );
        expect(result.route === 'native' && result.block.chart.series).toEqual([
            expect.objectContaining({ name: 'shipped' }),
            expect.objectContaining({ name: 'placed' }),
        ]);
    });

    it('sorts a time axis chronologically, labelled like the image axis', async () => {
        const result = await route(
            { type: 'line', x: 'month', y: ['orders', 'revenue'] },
            monthRows(['placed']),
        );
        expect(result.route === 'native' && result.block.chart).toEqual({
            type: 'line',
            series: [
                {
                    name: 'Orders',
                    data: [
                        { label: '2024-01', value: 0 },
                        { label: '2024-02', value: 1 },
                        { label: '2024-03', value: 2 },
                    ],
                },
                {
                    name: 'Revenue',
                    data: [
                        { label: '2024-01', value: 0 },
                        { label: '2024-02', value: 10 },
                        { label: '2024-03', value: 20 },
                    ],
                },
            ],
            axis_config: {
                categories: ['2024-01', '2024-02', '2024-03'],
            },
        });
    });

    it.each<[string, string, unknown[], string[]]>([
        [
            'a year grain',
            'year',
            ['2023-01-01', '2024-01-01'],
            ['2023', '2024'],
        ],
        [
            'inferred months',
            'day',
            ['2024-01-01', '2024-02-01'],
            ['2024-01', '2024-02'],
        ],
        [
            'inferred years',
            'created_at',
            ['2023-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
            ['2023', '2024'],
        ],
        [
            'days',
            'day',
            ['2024-01-01', '2024-01-02'],
            ['2024-01-01', '2024-01-02'],
        ],
        ['a single first-of-month date', 'day', ['2024-01-01'], ['2024-01-01']],
        [
            'times of day',
            'created_at',
            ['2024-01-01 00:00:00', '2024-01-01 12:30:00'],
            ['2024-01-01 00:00', '2024-01-01 12:30'],
        ],
    ])('labels %s compactly', async (_name, x, values, expected) => {
        const result = await route(
            { type: 'line', x },
            values.map((value, orders) => ({ [x]: value, orders })),
        );
        expect(
            result.route === 'native' && result.block.chart.axis_config,
        ).toEqual({ categories: expected });
    });

    it('truncates long labels and the title when they stay unique', async () => {
        const result = await route(
            { type: 'bar' },
            [
                { status: 'a very long category label one', orders: 1 },
                { status: 'another very long category label', orders: 2 },
            ],
            'A chart title that is much longer than fifty characters in total',
        );
        expect(result.route === 'native' && result.block).toMatchObject({
            title: 'A chart title that is much longer than fifty char…',
            chart: {
                axis_config: {
                    categories: [
                        'a very long categor…',
                        'another very long c…',
                    ],
                },
            },
        });
    });

    it('allows 20 categories and 12 series', async () => {
        expect((await route({ type: 'bar' }, categories(20))).route).toBe(
            'native',
        );
        const twelve = Array.from({ length: 12 }, (_, i) => `s${i}`);
        expect(
            (
                await route(
                    { type: 'line', x: 'month', groupBy: ['status'] },
                    monthRows(twelve),
                )
            ).route,
        ).toBe('native');
    });

    it.each<
        [
            string,
            Partial<ComposerBuiltinChartVizConfig> &
                Pick<ComposerBuiltinChartVizConfig, 'type'>,
            Record<string, unknown>[],
            string,
        ]
    >([
        [
            'horizontal bar',
            { type: 'bar', horizontal: true },
            statusRows,
            'horizontal_bar',
        ],
        ['area', { type: 'area' }, statusRows, 'area'],
        ['pie', { type: 'pie' }, statusRows, 'unsupported_type'],
        ['scatter', { type: 'scatter' }, statusRows, 'unsupported_type'],
        ['funnel', { type: 'funnel' }, statusRows, 'unsupported_type'],
        [
            'secondary axis',
            { type: 'line', y2: 'revenue' },
            statusRows,
            'secondary_axis',
        ],
        [
            'stacked multi-series bar',
            { type: 'bar', x: 'month', groupBy: ['status'], stack: true },
            monthRows(['placed', 'shipped']),
            'stacked',
        ],
        ['no rows', { type: 'bar' }, [], 'no_rows'],
        [
            '21 categories',
            { type: 'bar' },
            categories(21),
            'too_many_categories',
        ],
        [
            '13 series',
            { type: 'line', x: 'month', groupBy: ['status'] },
            monthRows(Array.from({ length: 13 }, (_, i) => `s${i}`)),
            'too_many_series',
        ],
        [
            'sparse pivot',
            { type: 'bar', x: 'month', groupBy: ['status'] },
            monthRows(['placed', 'shipped']).slice(1),
            'missing_value',
        ],
        [
            'null value',
            { type: 'bar' },
            [{ status: 'a', orders: null }],
            'missing_value',
        ],
        [
            'text value',
            { type: 'bar' },
            [{ status: 'a', orders: 'n/a' }],
            'non_numeric_value',
        ],
        [
            'empty category',
            { type: 'bar' },
            [{ status: '', orders: 1 }],
            'empty_label',
        ],
        [
            'duplicate category',
            { type: 'bar' },
            [
                { status: 'a', orders: 1 },
                { status: 'a', orders: 2 },
            ],
            'duplicate_category',
        ],
        [
            'colliding truncated labels',
            { type: 'bar' },
            [
                { status: 'the same twenty chars, then A', orders: 1 },
                { status: 'the same twenty chars, then B', orders: 2 },
            ],
            'category_label_collision',
        ],
        [
            'unparseable time value',
            { type: 'line', x: 'month' },
            [{ month: 'not a date', orders: 1 }],
            'invalid_time_value',
        ],
    ])('routes %s to the image', async (_name, viz, rows, reason) => {
        expect(await route(viz, rows)).toEqual({ route: 'image', reason });
    });

    it('keeps a stacked single-series bar native', async () => {
        expect(
            (await route({ type: 'bar', stack: true }, statusRows)).route,
        ).toBe('native');
    });

    it('routes a custom chart type to the image', async () => {
        const queryTool = {
            title: 'Custom',
            chartConfig: { customChartTypeSlug: 'sankey', fieldMapping: {} },
        } as unknown as ToolRunQueryArgsTransformed;
        expect(
            await getSlackNativeChart({
                queryTool,
                queryResults: { rows: statusRows, fields: {} },
                getPivotedResults,
                blockId: 'native',
            }),
        ).toEqual({ route: 'image', reason: 'unsupported_type' });
    });
});
