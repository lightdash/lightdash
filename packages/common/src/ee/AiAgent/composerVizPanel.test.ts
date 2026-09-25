import { DimensionType } from '../../types/field';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type PivotChartLayout,
} from '../../visualizations/types';
import { buildComposerVizConfig } from './composerViz';
import {
    addComposerVizY,
    composerVizConfigFitsColumns,
    composerVizNeedsPivot,
    getAvailableComposerVizKinds,
    getComposerVizPanelOptions,
    getComposerVizPanelValue,
    getComposerVizSort,
    parseComposerVizConfig,
    removeComposerVizY,
    resolveComposerVizColumns,
    setComposerVizGroupBy,
    setComposerVizSort,
    setComposerVizX,
    setComposerVizY,
    summarizeComposerVizConfig,
    switchComposerVizKind,
} from './composerVizPanel';

const column = (
    reference: string,
    type: DimensionType,
    label?: string,
): ResultColumn => ({ reference, type, ...(label ? { label } : {}) });

const month = column('month', DimensionType.DATE, 'Month');
const region = column('region', DimensionType.STRING, 'Region');
const revenue = column('revenue', DimensionType.NUMBER, 'Revenue');
const orders = column('orders', DimensionType.NUMBER);
const columns = [month, region, revenue, orders];

const rows: RawResultRow[] = [
    { month: '2026-01-01', region: 'EMEA', revenue: 10, orders: 1 },
    { month: '2026-01-01', region: 'APAC', revenue: 20, orders: 2 },
    { month: '2026-02-01', region: 'EMEA', revenue: 30, orders: 3 },
];

const layout = (
    overrides: Partial<PivotChartLayout> = {},
): PivotChartLayout => ({
    x: { reference: 'month', type: VizIndexType.TIME },
    y: [{ reference: 'revenue', aggregation: VizAggregationOptions.ANY }],
    groupBy: [],
    ...overrides,
});

const line = (overrides: Partial<PivotChartLayout> = {}) =>
    buildComposerVizConfig({ kind: 'line', fieldConfig: layout(overrides) });

const fieldConfig = (value: AllVizChartConfig): PivotChartLayout => {
    if (value.type === ChartKind.TABLE || !value.fieldConfig)
        throw new Error('expected a chart config');
    return value.fieldConfig;
};

const result = { columns, rows, node: null };
const edit = { ...result, remembered: null };

describe('getComposerVizPanelValue', () => {
    test('returns the stored config when every column is present', () => {
        const stored = line({ groupBy: [{ reference: 'region' }] });
        expect(getComposerVizPanelValue({ ...result, vizConfig: stored })).toBe(
            stored,
        );
    });

    test('falls back to the column-type default when a column is gone', () => {
        const stored = line({ groupBy: [{ reference: 'country' }] });
        const value = getComposerVizPanelValue({
            ...result,
            vizConfig: stored,
        });
        expect(value.type).toBe(ChartKind.TABLE);
    });

    test('invents a chart from the column types without a stored config', () => {
        const oneRegionPerMonth = rows.filter((row) => row.region === 'EMEA');
        const value = getComposerVizPanelValue({
            columns,
            rows: oneRegionPerMonth,
            node: null,
            vizConfig: null,
        });
        expect(value.type).toBe(ChartKind.LINE);
        expect(fieldConfig(value).x?.reference).toBe('month');
        expect(fieldConfig(value).y.map((y) => y.reference)).toEqual([
            'revenue',
        ]);
    });
});

describe('composerVizConfigFitsColumns', () => {
    test.each<{ name: string; value: AllVizChartConfig; fits: boolean }>([
        { name: 'known columns fit', value: line(), fits: true },
        {
            name: 'a non-numeric y does not fit',
            value: line({
                y: [
                    {
                        reference: 'region',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
            }),
            fits: false,
        },
        {
            name: 'a missing sort column does not fit',
            value: line({
                sortBy: [{ reference: 'gone', direction: SortByDirection.ASC }],
            }),
            fits: false,
        },
        {
            name: 'a line without x does not fit',
            value: line({ x: undefined }),
            fits: false,
        },
        {
            name: 'a table over unknown columns does not fit',
            value: {
                type: ChartKind.TABLE,
                metadata: { version: 1 },
                columns: {
                    gone: {
                        visible: true,
                        reference: 'gone',
                        label: 'Gone',
                        frozen: false,
                    },
                },
                display: undefined,
            },
            fits: false,
        },
    ])('$name', ({ value, fits }) => {
        expect(composerVizConfigFitsColumns(value, columns)).toBe(fits);
    });
});

describe('options', () => {
    test('kinds need a numeric column, a second column for an axis, and one row for a big number', () => {
        expect(getAvailableComposerVizKinds(columns, rows)).toEqual([
            'table',
            'bar',
            'line',
            'pie',
        ]);
        expect(getAvailableComposerVizKinds(columns, rows.slice(0, 1))).toEqual(
            ['table', 'bar', 'line', 'pie', 'big_number'],
        );
        expect(getAvailableComposerVizKinds([revenue], rows)).toEqual([
            'table',
        ]);
        expect(getAvailableComposerVizKinds([region], rows)).toEqual(['table']);
    });

    test('x offers every column non-numeric first, y numerics, split excludes x', () => {
        const options = getComposerVizPanelOptions(line(), columns, rows);
        expect(options.x.map((c) => c.reference)).toEqual([
            'month',
            'region',
            'revenue',
            'orders',
        ]);
        expect(options.y.map((c) => c.reference)).toEqual([
            'revenue',
            'orders',
        ]);
        expect(options.groupBy.map((c) => c.reference)).toEqual(['region']);
        expect(options.aggregations).toContain(VizAggregationOptions.ANY);
    });
});

describe('edits', () => {
    test('setting x retypes the axis and clears a split on the same column', () => {
        const value = setComposerVizX(
            line({ groupBy: [{ reference: 'region' }] }),
            'region',
            columns,
        );
        expect(fieldConfig(value).x).toEqual({
            reference: 'region',
            type: VizIndexType.CATEGORY,
        });
        expect(fieldConfig(value).groupBy).toEqual([]);
    });

    test('y edits change the column and aggregation at an index', () => {
        const value = setComposerVizY(line(), 0, {
            reference: 'orders',
            aggregation: VizAggregationOptions.SUM,
        });
        expect(fieldConfig(value).y).toEqual([
            { reference: 'orders', aggregation: VizAggregationOptions.SUM },
        ]);
    });

    test('adding a y takes the next unused numeric column, then stops', () => {
        const withTwo = addComposerVizY(line(), columns);
        expect(fieldConfig(withTwo).y.map((y) => y.reference)).toEqual([
            'revenue',
            'orders',
        ]);
        expect(addComposerVizY(withTwo, columns)).toEqual(withTwo);
    });

    test('removing a y never drops the last one', () => {
        const withTwo = addComposerVizY(line(), columns);
        const one = removeComposerVizY(withTwo, 0);
        expect(fieldConfig(one).y.map((y) => y.reference)).toEqual(['orders']);
        expect(removeComposerVizY(one, 0)).toEqual(one);
    });

    test('a value sort follows the first y through y edits', () => {
        const sorted = setComposerVizSort(
            addComposerVizY(line(), columns),
            'value_desc',
        );
        expect(getComposerVizSort(sorted)).toBe('value_desc');
        expect(fieldConfig(sorted).sortBy?.[0].reference).toBe('revenue');
        const removed = removeComposerVizY(sorted, 0);
        expect(fieldConfig(removed).sortBy?.[0].reference).toBe('orders');
        const unsorted = setComposerVizSort(removed, 'x_order');
        expect(getComposerVizSort(unsorted)).toBe('x_order');
        expect(fieldConfig(unsorted)).not.toHaveProperty('sortBy');
    });

    test('a split is set and cleared', () => {
        const split = setComposerVizGroupBy(line(), 'region');
        expect(fieldConfig(split).groupBy).toEqual([{ reference: 'region' }]);
        expect(fieldConfig(setComposerVizGroupBy(split, null)).groupBy).toEqual(
            [],
        );
    });

    test('edits leave a table untouched', () => {
        const table = switchComposerVizKind(line(), 'table', edit);
        expect(setComposerVizGroupBy(table, 'region')).toBe(table);
    });
});

describe('switchComposerVizKind', () => {
    const split = line({
        y: [
            { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
            { reference: 'orders', aggregation: VizAggregationOptions.ANY },
        ],
        groupBy: [{ reference: 'region' }],
    });

    test('bar keeps the whole field config', () => {
        const bar = switchComposerVizKind(split, 'bar', edit);
        expect(bar.type).toBe(ChartKind.VERTICAL_BAR);
        expect(fieldConfig(bar)).toEqual(fieldConfig(split));
    });

    test('pie drops the split and extra values', () => {
        const pie = switchComposerVizKind(split, 'pie', edit);
        expect(fieldConfig(pie)).toEqual(
            layout({
                y: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
            }),
        );
    });

    test('big number keeps only the first value', () => {
        const big = switchComposerVizKind(split, 'big_number', edit);
        expect(fieldConfig(big)).toEqual({
            x: undefined,
            y: [
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.SUM,
                },
            ],
            groupBy: [],
        });
    });

    test('leaving a big number picks an x again', () => {
        const big = switchComposerVizKind(split, 'big_number', edit);
        const bar = switchComposerVizKind(big, 'bar', edit);
        expect(fieldConfig(bar).x?.reference).toBe('month');
    });

    test('table carries no field config; leaving it restores the remembered config', () => {
        const table = switchComposerVizKind(split, 'table', edit);
        expect(table).toEqual({
            type: ChartKind.TABLE,
            metadata: { version: 1 },
            columns: {},
            display: undefined,
        });
        const back = switchComposerVizKind(table, 'line', {
            ...result,
            remembered: split,
        });
        expect(fieldConfig(back)).toEqual(fieldConfig(split));
    });

    test('leaving table with nothing remembered seeds from the column types', () => {
        const table = switchComposerVizKind(split, 'table', edit);
        const bar = switchComposerVizKind(table, 'bar', edit);
        expect(fieldConfig(bar).x?.reference).toBe('month');
        expect(fieldConfig(bar).y[0].reference).toBe('revenue');
    });

    test('a remembered config that no longer fits is ignored', () => {
        const table = switchComposerVizKind(split, 'table', edit);
        const stale = line({ groupBy: [{ reference: 'country' }] });
        const bar = switchComposerVizKind(table, 'bar', {
            ...result,
            remembered: stale,
        });
        expect(fieldConfig(bar).groupBy).toEqual([]);
    });

    test('all-numeric columns still get an x', () => {
        const numeric = { columns: [revenue, orders], rows, node: null };
        const bar = switchComposerVizKind(line(), 'bar', {
            ...numeric,
            remembered: null,
        });
        expect(fieldConfig(bar).x?.reference).toBe('month');
        const seeded = switchComposerVizKind(
            switchComposerVizKind(line(), 'table', edit),
            'bar',
            { ...numeric, remembered: null },
        );
        expect(fieldConfig(seeded).x?.reference).toBe('orders');
    });
});

describe('summary and rendering helpers', () => {
    test('summary uses labels, an aggregation prefix and at most two values', () => {
        expect(summarizeComposerVizConfig(line(), columns)).toBe(
            'Month × Revenue',
        );
        expect(
            summarizeComposerVizConfig(
                line({
                    y: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupBy: [{ reference: 'region' }],
                }),
                columns,
            ),
        ).toBe('Month × sum Revenue by Region');
        const three = line({
            y: ['revenue', 'orders', 'other'].map((reference) => ({
                reference,
                aggregation: VizAggregationOptions.ANY,
            })),
        });
        expect(summarizeComposerVizConfig(three, columns)).toBe(
            'Month × Revenue, orders +1',
        );
        expect(
            summarizeComposerVizConfig(
                switchComposerVizKind(line(), 'big_number', edit),
                columns,
            ),
        ).toBe('Revenue');
        expect(
            summarizeComposerVizConfig(
                switchComposerVizKind(line(), 'table', edit),
                columns,
            ),
        ).toBe('Table');
    });

    test('columns resolve from the result and fail on a missing one', () => {
        const resolved = resolveComposerVizColumns(
            layout({ groupBy: [{ reference: 'region' }] }),
            columns,
        );
        expect(resolved?.x).toBe(month);
        expect(resolved?.y).toEqual([revenue]);
        expect(resolved?.groupBy).toBe(region);
        expect(
            resolveComposerVizColumns(
                layout({ groupBy: [{ reference: 'gone' }] }),
                columns,
            ),
        ).toBeNull();
    });

    test('a pivot is needed for a split, an aggregation or a value sort', () => {
        expect(composerVizNeedsPivot(layout())).toBe(false);
        expect(
            composerVizNeedsPivot(
                layout({ groupBy: [{ reference: 'region' }] }),
            ),
        ).toBe(true);
        expect(
            composerVizNeedsPivot(
                layout({
                    y: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                }),
            ),
        ).toBe(true);
        expect(
            composerVizNeedsPivot(
                layout({
                    sortBy: [
                        {
                            reference: 'revenue',
                            direction: SortByDirection.DESC,
                        },
                    ],
                }),
            ),
        ).toBe(true);
    });
});

describe('parseComposerVizConfig', () => {
    test('accepts a chart config and normalises the layout', () => {
        const parsed = parseComposerVizConfig({
            type: ChartKind.LINE,
            metadata: { version: 1 },
            fieldConfig: {
                x: { reference: 'month', type: VizIndexType.TIME },
                y: [{ reference: 'revenue', aggregation: 'sum' }],
            },
        });
        expect(parsed).toEqual({ ok: true, vizConfig: expect.anything() });
        if (!parsed.ok) throw new Error(parsed.error);
        expect(fieldConfig(parsed.vizConfig).groupBy).toEqual([]);
        expect(parsed.vizConfig.type).toBe(ChartKind.LINE);
    });

    test('accepts a table config', () => {
        const parsed = parseComposerVizConfig({
            type: ChartKind.TABLE,
            metadata: { version: 1 },
            columns: {},
        });
        expect(parsed.ok).toBe(true);
    });

    test.each<{ name: string; input: unknown }>([
        {
            name: 'an unsupported kind',
            input: {
                type: ChartKind.SCATTER,
                metadata: { version: 1 },
                fieldConfig: layout(),
            },
        },
        {
            name: 'display options',
            input: {
                type: ChartKind.LINE,
                metadata: { version: 1 },
                fieldConfig: layout(),
                display: { legend: {} },
            },
        },
        {
            name: 'no y',
            input: {
                type: ChartKind.VERTICAL_BAR,
                metadata: { version: 1 },
                fieldConfig: { ...layout(), y: [] },
            },
        },
        {
            name: 'an unknown aggregation',
            input: {
                type: ChartKind.VERTICAL_BAR,
                metadata: { version: 1 },
                fieldConfig: {
                    ...layout(),
                    y: [{ reference: 'revenue', aggregation: 'median' }],
                },
            },
        },
        { name: 'not an object', input: 'line' },
    ])('rejects $name', ({ input }) => {
        expect(parseComposerVizConfig(input).ok).toBe(false);
    });
});
