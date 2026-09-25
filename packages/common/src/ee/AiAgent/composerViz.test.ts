import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { VizIndexType } from '../../visualizations/types';
import { buildComposerChartData, getComposerVizPlan } from './composerViz';

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
) => getComposerVizPlan({ columns, rows, node });

const CARTESIAN = ['table', 'bar', 'horizontal', 'line'];

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
            name: 'string + number opens as bar and offers pie and funnel',
            columns: [
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'status',
            kinds: [...CARTESIAN, 'pie', 'funnel'],
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
            kinds: [...CARTESIAN, 'pie', 'funnel'],
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
            kinds: [...CARTESIAN, 'pie', 'funnel'],
        },
    ])('$name', ({ columns, defaultKind, x, kinds }) => {
        const result = plan(columns);
        expect(result.defaultKind).toBe(defaultKind);
        expect(result.availableKinds).toEqual(kinds);
        expect(result.axes.bar?.x?.reference).toBe(x);
        expect(result.axes.bar?.y.reference).toBe('n');
        expect(result.axes.horizontal).toEqual(result.axes.bar);
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
    ])('$name offers table only', ({ columns }) => {
        expect(plan(columns)).toEqual({
            availableKinds: ['table'],
            defaultKind: 'table',
            axes: {},
        });
    });

    test('only numeric columns offer scatter over the first two, table by default', () => {
        const result = plan([
            column('a', DimensionType.NUMBER),
            column('b', DimensionType.NUMBER),
            column('c', DimensionType.NUMBER),
        ]);
        expect(result.availableKinds).toEqual(['table', 'scatter']);
        expect(result.defaultKind).toBe('table');
        expect(result.axes.scatter).toEqual({
            x: column('a', DimensionType.NUMBER),
            y: column('b', DimensionType.NUMBER),
        });
    });

    test('scatter needs two numeric columns', () => {
        expect(
            plan([
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ]).axes.scatter,
        ).toBeUndefined();
        expect(
            plan([
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
                column('m', DimensionType.NUMBER),
            ]).axes.scatter,
        ).toEqual({
            x: column('n', DimensionType.NUMBER),
            y: column('m', DimensionType.NUMBER),
        });
    });

    test('duplicate x values default to table, keep bar and line, and drop pie and funnel', () => {
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

    test('pie and funnel follow the string column, not a date x', () => {
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
            'funnel',
            'big_number',
        ]);
        expect(result.axes.big_number).toEqual({
            x: null,
            y: column('n', DimensionType.NUMBER),
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
