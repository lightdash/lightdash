import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { VizIndexType } from '../../visualizations/types';
import { buildComposerChartData, getComposerVizPlan } from './composerViz';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});

const plan = (
    columns: ResultColumn[],
    rows: RawResultRow[] = [{}],
    node: SourceQuery | null = null,
) => getComposerVizPlan({ columns, rows, node });

describe('getComposerVizPlan', () => {
    test.each<{
        name: string;
        columns: ResultColumn[];
        defaultKind: string;
        x: string | null;
    }>([
        {
            name: 'date + number opens as line',
            columns: [
                column('day', DimensionType.DATE),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'day',
        },
        {
            name: 'timestamp + number opens as line',
            columns: [
                column('at', DimensionType.TIMESTAMP),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'at',
        },
        {
            name: 'string + number opens as bar',
            columns: [
                column('status', DimensionType.STRING),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'status',
        },
        {
            name: 'boolean + number opens as bar',
            columns: [
                column('flag', DimensionType.BOOLEAN),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'bar',
            x: 'flag',
        },
        {
            name: 'date wins over string for x',
            columns: [
                column('status', DimensionType.STRING),
                column('day', DimensionType.DATE),
                column('n', DimensionType.NUMBER),
            ],
            defaultKind: 'line',
            x: 'day',
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
        },
    ])('$name', ({ columns, defaultKind, x }) => {
        const result = plan(columns);
        expect(result.defaultKind).toBe(defaultKind);
        expect(result.availableKinds).toEqual(['table', 'bar', 'line']);
        expect(result.x?.reference).toBe(x);
        expect(result.y?.reference).toBe('n');
    });

    test.each<{ name: string; columns: ResultColumn[] }>([
        { name: 'no columns', columns: [] },
        {
            name: 'only numeric columns',
            columns: [
                column('a', DimensionType.NUMBER),
                column('b', DimensionType.NUMBER),
            ],
        },
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
            x: null,
            y: null,
        });
    });

    test('duplicate x values default to table but keep bar and line selectable', () => {
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
        expect(result.availableKinds).toEqual(['table', 'bar', 'line']);
    });

    test('y is the first numeric column that is not x', () => {
        const result = plan([
            column('n1', DimensionType.NUMBER),
            column('status', DimensionType.STRING),
            column('n2', DimensionType.NUMBER),
        ]);
        expect(result.x?.reference).toBe('status');
        expect(result.y?.reference).toBe('n1');
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

        test('puts its declared dimension on x and metric on y', () => {
            const result = plan(columns, [{}], node);
            expect(result.x?.reference).toBe('orders_status');
            expect(result.y?.reference).toBe('orders_total');
            expect(result.defaultKind).toBe('bar');
        });

        test('falls back to the type rule when declared fields are absent', () => {
            const result = plan(columns, [{}], {
                ...node,
                dimensions: ['missing'],
                metrics: ['missing_too'],
            });
            expect(result.x?.reference).toBe('orders_created_day');
            expect(result.y?.reference).toBe('orders_count');
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
});
