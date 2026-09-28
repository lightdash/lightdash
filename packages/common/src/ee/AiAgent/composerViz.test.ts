import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
import {
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
} from '../../visualizations/types';
import {
    buildComposerChartData,
    getComposerSeriesSplitLayout,
    getComposerVizPlan,
} from './composerViz';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});

const twoRows = [
    { status: 'a', flag: true, day: '2024-01-01', at: '2024-01-01', n: 1 },
    { status: 'b', flag: false, day: '2024-01-02', at: '2024-01-02', n: 2 },
];

const plan = (
    columns: ResultColumn[],
    rows: RawResultRow[] = twoRows,
    node: SourceQuery | null = null,
) => getComposerVizPlan({ columns, rows, node, vizConfig: null });

const CARTESIAN = ['table', 'bar', 'line'];

describe('getComposerVizPlan', () => {
    test.each<{
        name: string;
        columns: ResultColumn[];
        defaultKind: string;
        x: string | null;
        kinds: string[];
    }>([
        {
            name: 'date + number opens as line',
            columns: [
                column('day', DimensionType.DATE),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'day',
            kinds: CARTESIAN,
        },
        {
            name: 'timestamp + number opens as line',
            columns: [
                column('at', DimensionType.TIMESTAMP),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'at',
            kinds: CARTESIAN,
        },
        {
            name: 'string + number opens as bar and offers pie',
            columns: [
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'status',
            kinds: [...CARTESIAN, 'pie'],
        },
        {
            name: 'boolean + number opens as bar',
            columns: [
                column('flag', DimensionType.BOOLEAN),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'flag',
            kinds: CARTESIAN,
        },
        {
            name: 'date wins over string for x; pie still uses the string',
            columns: [
                column('status', DimensionType.STRING),
                column('day', DimensionType.DATE),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'day',
            kinds: [...CARTESIAN, 'pie'],
        },
        {
            name: 'string wins over boolean for x',
            columns: [
                column('flag', DimensionType.BOOLEAN),
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'status',
            kinds: [...CARTESIAN, 'pie'],
        },
    ])('$name', ({ columns, defaultKind, x, kinds }) => {
        const result = plan(columns);
        expect(result.defaultKind).toBe(defaultKind);
        expect(result.availableKinds).toEqual(kinds);
        expect(result.axes.bar?.x?.reference).toBe(x);
        expect(result.axes.bar?.y.reference).toBe('n');
        expect(result.axes.line).toEqual(result.axes.bar);
    });

    test.each<{ name: string; columns: ResultColumn[] }>([
        { name: 'no columns', columns: [] },
        {
            name: 'no numeric column',
            columns: [
                column('status', DimensionType.STRING),
                column('day', DimensionType.DATE),
            ],
        },
        {
            name: 'only numeric columns',
            columns: [
                column('a', DimensionType.NUMBER),
                column('b', DimensionType.NUMBER),
            ],
        },
    ])('$name offers table only', ({ columns }) => {
        expect(plan(columns)).toEqual({
            availableKinds: ['table'],
            defaultKind: 'table',
            axes: {},
        });
    });

    test('duplicate x values default to table, keep bar and line, and drop pie', () => {
        const result = plan(
            [
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            [
                { status: 'a', n: 1 },
                { status: 'a', n: 2 },
            ],
        );
        expect(result.defaultKind).toBe('table');
        expect(result.availableKinds).toEqual(CARTESIAN);
    });

    test('pie follows the string column, not a date x', () => {
        const columns = [
            column('day', DimensionType.DATE),
            column('status', DimensionType.STRING),
            column('n', DimensionType.NUMBER),
        ];
        const uniqueStatus = plan(columns, [
            { day: '2024-01-01', status: 'a', n: 1 },
            { day: '2024-01-01', status: 'b', n: 2 },
        ]);
        expect(uniqueStatus.defaultKind).toBe('table');
        expect(uniqueStatus.axes.pie?.x?.reference).toBe('status');

        const duplicateStatus = plan(columns, [
            { day: '2024-01-01', status: 'a', n: 1 },
            { day: '2024-01-02', status: 'a', n: 2 },
        ]);
        expect(duplicateStatus.defaultKind).toBe('line');
        expect(duplicateStatus.axes.pie).toBeUndefined();
    });

    test('one row with a number opens as a big number and offers it last', () => {
        const result = plan(
            [
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            [{ status: 'a', n: 1 }],
        );
        expect(result.defaultKind).toBe('big_number');
        expect(result.availableKinds).toEqual([
            ...CARTESIAN,
            'pie',
            'big_number',
        ]);
        expect(result.axes.big_number).toEqual({
            x: null,
            y: column('n', DimensionType.NUMBER),
            seriesSplit: null,
        });
    });

    test('one row with only a number offers table and big number', () => {
        const result = plan([column('n', DimensionType.NUMBER)], [{ n: 1 }]);
        expect(result.availableKinds).toEqual(['table', 'big_number']);
        expect(result.defaultKind).toBe('big_number');
    });

    test('y is the first numeric column that is not x', () => {
        const result = plan([
            column('n1', DimensionType.NUMBER),
            column('status', DimensionType.STRING),
            column('n2', DimensionType.NUMBER),
        ]);
        expect(result.axes.bar?.x?.reference).toBe('status');
        expect(result.axes.bar?.y.reference).toBe('n1');
    });

    describe('semantic-layer node', () => {
        const node: SourceQuery = {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'orders',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total'],
        };
        const columns = [
            column('orders_created_day', DimensionType.DATE),
            column('orders_count', DimensionType.NUMBER),
            column('orders_status', DimensionType.STRING),
            column('orders_total', DimensionType.NUMBER),
        ];
        const rows = [
            { orders_status: 'a', orders_created_day: '2024-01-01' },
            { orders_status: 'b', orders_created_day: '2024-01-02' },
        ];

        test('puts its declared dimension on x and metric on y', () => {
            const result = plan(columns, rows, node);
            expect(result.axes.bar?.x?.reference).toBe('orders_status');
            expect(result.axes.bar?.y.reference).toBe('orders_total');
            expect(result.axes.pie?.y.reference).toBe('orders_total');
            expect(result.defaultKind).toBe('bar');
        });

        test('falls back to the type rule when declared fields are absent', () => {
            const result = plan(columns, rows, {
                ...node,
                dimensions: ['missing'],
                metrics: ['missing_too'],
            });
            expect(result.axes.bar?.x?.reference).toBe('orders_created_day');
            expect(result.axes.bar?.y.reference).toBe('orders_count');
        });
    });
});

describe('getComposerVizPlan seeded from a stored viz config', () => {
    const columns = [
        column('order_id', DimensionType.NUMBER),
        column('status', DimensionType.STRING),
        column('month', DimensionType.DATE),
        column('revenue', DimensionType.NUMBER),
    ];
    const rows = [
        { order_id: 1, status: 'a', month: '2024-01-01', revenue: 10 },
        { order_id: 2, status: 'b', month: '2024-02-01', revenue: 20 },
    ];
    const cartesian = (
        type: ChartKind.VERTICAL_BAR | ChartKind.LINE,
        x: string,
        y: string,
        groupBy: string | null = null,
    ): AllVizChartConfig => ({
        type,
        metadata: { version: 1 },
        fieldConfig: {
            x: { reference: x, type: VizIndexType.CATEGORY },
            y: [
                {
                    reference: y,
                    aggregation: groupBy
                        ? VizAggregationOptions.SUM
                        : VizAggregationOptions.ANY,
                },
            ],
            groupBy: groupBy ? [{ reference: groupBy }] : [],
        },
        display: undefined,
    });
    const seeded = (vizConfig: AllVizChartConfig | null, rowsIn = rows) =>
        getComposerVizPlan({ columns, rows: rowsIn, node: null, vizConfig });

    test('opens on the stored kind and axes', () => {
        const result = seeded(
            cartesian(ChartKind.VERTICAL_BAR, 'status', 'revenue'),
        );
        expect(result.defaultKind).toBe('bar');
        expect(result.axes.bar?.x?.reference).toBe('status');
        expect(result.axes.bar?.y.reference).toBe('revenue');
    });

    test('switching kind keeps the stored axes where the kind can use them', () => {
        const result = seeded(cartesian(ChartKind.LINE, 'status', 'revenue'));
        expect(result.defaultKind).toBe('line');
        expect(result.axes.bar).toEqual(result.axes.line);
        expect(result.axes.pie?.x?.reference).toBe('status');
        expect(result.axes.pie?.y.reference).toBe('revenue');
    });

    test('the column-type default fills kinds the stored axes cannot serve', () => {
        const result = seeded(cartesian(ChartKind.LINE, 'month', 'revenue'));
        expect(result.axes.line?.x?.reference).toBe('month');
        expect(result.axes.pie?.x?.reference).toBe('status');
        expect(result.axes.pie?.y.reference).toBe('order_id');
    });

    test('a stored big number uses the stored value', () => {
        const result = seeded(
            {
                type: ChartKind.BIG_NUMBER,
                metadata: { version: 1 },
                fieldConfig: {
                    x: undefined,
                    y: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                    groupBy: [],
                },
                display: undefined,
            },
            [rows[0]],
        );
        expect(result.defaultKind).toBe('big_number');
        expect(result.axes.big_number).toEqual({
            x: null,
            y: columns[3],
            seriesSplit: null,
        });
    });

    test('a stored table opens as the table', () => {
        const result = seeded({
            type: ChartKind.TABLE,
            metadata: { version: 1 },
            columns: {
                status: {
                    visible: true,
                    reference: 'status',
                    label: 'status',
                    frozen: false,
                },
            },
            display: undefined,
        });
        expect(result.defaultKind).toBe('table');
        expect(result.availableKinds).toContain('bar');
    });

    test('falls back to the column-type default when null or its columns are gone', () => {
        const columnTypeDefault = seeded(null);
        expect(columnTypeDefault.defaultKind).toBe('line');
        expect(
            seeded(cartesian(ChartKind.VERTICAL_BAR, 'region', 'revenue')),
        ).toEqual(columnTypeDefault);
        expect(
            seeded(cartesian(ChartKind.VERTICAL_BAR, 'status', 'profit')),
        ).toEqual(columnTypeDefault);
    });

    describe('series split', () => {
        const byRegion = [
            { region: 'eu', month: '2024-01-01', revenue: 10 },
            { region: 'us', month: '2024-01-01', revenue: 20 },
            { region: 'eu', month: '2024-02-01', revenue: 30 },
        ];
        const splitColumns = [
            column('region', DimensionType.STRING),
            column('month', DimensionType.DATE),
            column('revenue', DimensionType.NUMBER),
        ];
        const splitSeeded = (vizConfig: AllVizChartConfig) =>
            getComposerVizPlan({
                columns: splitColumns,
                rows: byRegion,
                node: null,
                vizConfig,
            });

        test('a stored line with groupBy opens as line split by that column, despite duplicate x values', () => {
            const result = splitSeeded(
                cartesian(ChartKind.LINE, 'month', 'revenue', 'region'),
            );
            expect(result.defaultKind).toBe('line');
            expect(result.axes.line).toEqual({
                x: splitColumns[1],
                y: splitColumns[2],
                seriesSplit: {
                    groupBy: splitColumns[0],
                    aggregation: VizAggregationOptions.SUM,
                },
            });
            expect(result.axes.bar).toEqual(result.axes.line);
            expect(getComposerSeriesSplitLayout(result.axes.line!)).toEqual({
                x: { reference: 'month', type: VizIndexType.TIME },
                y: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [{ reference: 'region' }],
            });
        });

        test('the pivot layout takes the stored y aggregation', () => {
            const result = splitSeeded({
                type: ChartKind.LINE,
                metadata: { version: 1 },
                fieldConfig: {
                    x: { reference: 'month', type: VizIndexType.TIME },
                    y: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.MAX,
                        },
                    ],
                    groupBy: [{ reference: 'region' }],
                },
                display: undefined,
            });
            expect(getComposerSeriesSplitLayout(result.axes.line!)?.y).toEqual([
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.MAX,
                },
            ]);
        });

        test('a stored groupBy whose column is gone falls back to the column-type default', () => {
            const result = splitSeeded(
                cartesian(ChartKind.LINE, 'month', 'revenue', 'country'),
            );
            expect(result).toEqual(
                getComposerVizPlan({
                    columns: splitColumns,
                    rows: byRegion,
                    node: null,
                    vizConfig: null,
                }),
            );
            expect(result.defaultKind).toBe('table');
            expect(getComposerSeriesSplitLayout(result.axes.line!)).toBeNull();
        });
    });
});

describe('buildComposerChartData', () => {
    test('uses x as the index and y as the single value column, rows as they come', () => {
        const { data, layout } = buildComposerChartData({
            rows: [
                { day: '2024-01-01', n: 3, extra: 'x' },
                { day: '2024-01-02', n: 5, extra: 'y' },
            ],
            x: column('day', DimensionType.DATE),
            y: column('n', DimensionType.NUMBER),
        });
        expect(data.results).toEqual([
            { day: '2024-01-01', n: 3 },
            { day: '2024-01-02', n: 5 },
        ]);
        expect(data.indexColumn).toEqual({
            reference: 'day',
            type: VizIndexType.TIME,
        });
        expect(data.valuesColumns.map((c) => c.pivotColumnName)).toEqual(['n']);
        expect(layout.x).toEqual({ reference: 'day', type: VizIndexType.TIME });
        expect(layout.y.map((y) => y.reference)).toEqual(['n']);
    });

    test('a big number has no index, only the value column', () => {
        const { data, layout } = buildComposerChartData({
            rows: [{ n: 3, status: 'a' }],
            x: null,
            y: column('n', DimensionType.NUMBER),
        });
        expect(data.results).toEqual([{ n: 3 }]);
        expect(data.indexColumn).toBeUndefined();
        expect(layout.x).toBeUndefined();
        expect(layout.y.map((y) => y.reference)).toEqual(['n']);
    });
});
