import {
    CartesianSeriesType,
    ChartType,
    ConditionalFormattingColorApplyTo,
    CustomDimensionType,
    DimensionType,
    FieldType,
    FilterOperator,
    FunnelChartDataInput,
    MetricType,
    QueryHistoryStatus,
    TableCalculationType,
    VizAggregationOptions,
    XAxisSortType,
    type ChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type RawResultRow,
    type Series,
} from '@lightdash/common';
import { toResultRows } from '@lightdash/visualization';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';

const dim = (name: string, type: DimensionType): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});
const met = (name: string, type: MetricType, format?: string): Metric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    ...(format ? { format: format as Metric['format'] } : {}),
});

export const fields: ItemsMap = {
    orders_status: dim('status', DimensionType.STRING),
    orders_channel: dim('channel', DimensionType.STRING),
    orders_created_day: dim('created_day', DimensionType.DATE),
    orders_created_at: dim('created_at', DimensionType.TIMESTAMP),
    orders_revenue: met('revenue', MetricType.SUM, 'usd'),
    orders_count: met('count', MetricType.COUNT),
    orders_profit: met('profit', MetricType.SUM),
    margin: {
        name: 'margin',
        displayName: 'Margin',
        sql: '',
        type: TableCalculationType.NUMBER,
    } as ItemsMap[string],
    bucket: {
        id: 'bucket',
        name: 'bucket',
        table: 'orders',
        type: CustomDimensionType.SQL,
        sql: '',
        dimensionType: DimensionType.STRING,
    } as ItemsMap[string],
};

export const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [
        'orders_status',
        'orders_channel',
        'orders_created_day',
        'orders_created_at',
    ],
    metrics: ['orders_revenue', 'orders_count', 'orders_profit'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [
        {
            name: 'margin',
            displayName: 'Margin',
            sql: '',
            type: TableCalculationType.NUMBER,
        },
    ],
    customDimensions: [
        {
            id: 'bucket',
            name: 'bucket',
            table: 'orders',
            type: CustomDimensionType.SQL,
            sql: '',
            dimensionType: DimensionType.STRING,
        },
    ],
};

export const columnOrder = [
    'orders_status',
    'orders_channel',
    'orders_created_day',
    'orders_created_at',
    'bucket',
    'orders_revenue',
    'orders_count',
    'orders_profit',
    'margin',
];

const statuses = ['completed', 'shipped', 'returned', 'pending'];
const channels = ['web', 'store', 'app'];
export const rawRows: RawResultRow[] = statuses.flatMap((status, i) =>
    channels.map((channel, j) => ({
        orders_status: status,
        orders_channel: channel,
        orders_created_day: `2024-0${i + 1}-1${j}`,
        orders_created_at: `2024-0${i + 1}-1${j}T0${j}:30:00.000Z`,
        bucket: j % 2 === 0 ? 'low' : 'high',
        orders_revenue: 1000 - i * 170 + j * 55.5,
        orders_count: (i + 1) * (j + 2),
        orders_profit: (j - 1) * 100 - i * 13,
        margin: (j - 1) * 0.1 + i / 50,
    })),
);

type Results = InfiniteQueryResults & {
    metricQuery: MetricQuery;
    fields: ItemsMap;
    resolvedTimezone?: string;
};

const baseResults = (rows: RawResultRow[]): Results => {
    const resultRows = toResultRows(rows, fields);
    return {
        queryUuid: 'q',
        queryStatus: QueryHistoryStatus.READY,
        rows: resultRows,
        totalResults: resultRows.length,
        isInitialLoading: false,
        isFetchingFirstPage: false,
        isFetchingRows: false,
        isFetchingAllPages: false,
        fetchMoreRows: () => {},
        refetchRows: async () => {},
        setFetchAll: () => {},
        fetchAll: false,
        hasFetchedAllRows: true,
        totalClientFetchTimeMs: undefined,
        error: null,
        metricQuery,
        fields,
    };
};

export const results = baseResults(rawRows);

/** One row per status with the channel pivoted into columns (SQL pivot). */
export const sqlPivotedResults: Results = (() => {
    const metrics = ['orders_revenue', 'orders_count'];
    const pivotRows: RawResultRow[] = statuses.map((status) => {
        const row: RawResultRow = { orders_status: status };
        rawRows
            .filter((r) => r.orders_status === status)
            .forEach((r) => {
                metrics.forEach((m) => {
                    row[`${m}_any_${r.orders_channel}`] = r[m];
                });
            });
        return row;
    });
    const resultRows = pivotRows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
                k,
                { value: { raw: v, formatted: String(v) } },
            ]),
        ),
    );
    return {
        ...baseResults([]),
        rows: resultRows,
        totalResults: resultRows.length,
        pivotDetails: {
            totalColumnCount: metrics.length * channels.length,
            indexColumn: undefined,
            groupByColumns: [{ reference: 'orders_channel' }],
            sortBy: undefined,
            originalColumns: {},
            valuesColumns: metrics.flatMap((m) =>
                channels.map((channel) => ({
                    referenceField: m,
                    pivotColumnName: `${m}_any_${channel}`,
                    aggregation: VizAggregationOptions.ANY,
                    pivotValues: [
                        { referenceField: 'orders_channel', value: channel },
                    ],
                })),
            ),
        },
    };
})();

export const withTimezone = (r: Results, tz: string): Results => ({
    ...r,
    resolvedTimezone: tz,
});

/* ---------------- deterministic RNG ---------------- */
export const rng = (seed: number) => {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
};
export const pick = <T>(r: () => number, xs: readonly T[]): T =>
    xs[Math.floor(r() * xs.length)];

/* ---------------- cartesian cases ---------------- */
export type CartesianCase = {
    name: string;
    chartConfig: ChartConfig;
    pivotColumns?: string[];
    results: Results;
};

type Axes = {
    x: string;
    y: string[];
    type: 'bar' | 'line' | 'area' | 'scatter' | 'mix';
    flip: boolean;
    stack: undefined | 'stack' | 'stack100';
    twoAxes: boolean;
    refLine: boolean;
    sort: undefined | 'category' | 'bar_totals' | 'inverse';
    rowLimit: boolean;
    dataZoom: boolean;
    legend:
        | undefined
        | 'hidden'
        | 'outsideRight'
        | 'outsideLeft'
        | 'vertical'
        | 'selected';
    condFormat: boolean;
    colorByCategory: boolean;
    tz: undefined | 'America/New_York' | 'Asia/Kolkata';
    pivot: undefined | 'client' | 'sql';
    savedSeries: boolean;
    labels: boolean;
};

export const X_CHOICES = [
    'orders_status',
    'orders_created_day',
    'orders_created_at',
    'bucket',
    'orders_revenue',
];
export const Y_CHOICES = [
    ['orders_revenue'],
    ['orders_revenue', 'orders_count'],
    ['orders_revenue', 'orders_profit', 'margin'],
];

const seriesTypeFor = (t: Axes['type'], i: number): CartesianSeriesType => {
    switch (t) {
        case 'bar':
            return CartesianSeriesType.BAR;
        case 'line':
        case 'area':
            return CartesianSeriesType.LINE;
        case 'scatter':
            return CartesianSeriesType.SCATTER;
        default:
            return i === 0 ? CartesianSeriesType.BAR : CartesianSeriesType.LINE;
    }
};

export const buildCartesianCase = (a: Axes): CartesianCase => {
    const pivotColumns = a.pivot ? ['orders_channel'] : undefined;
    const yFields =
        a.pivot === 'sql'
            ? ['orders_revenue', 'orders_count'].slice(
                  0,
                  a.y.length > 1 ? 2 : 1,
              )
            : a.y;
    const x = a.pivot === 'sql' ? 'orders_status' : a.x;
    const expand = (yField: string, i: number): Series[] => {
        const pivots = a.pivot ? channels : [undefined];
        return pivots.map((channel) => ({
            type: seriesTypeFor(a.type, i),
            encode: {
                xRef: { field: x },
                yRef: {
                    field: yField,
                    ...(channel
                        ? {
                              pivotValues: [
                                  { field: 'orders_channel', value: channel },
                              ],
                          }
                        : {}),
                },
            },
            yAxisIndex: a.twoAxes && i > 0 ? 1 : 0,
            ...(a.type === 'area' ? { areaStyle: {} } : {}),
            ...(a.stack ? { stack: yField } : {}),
            ...(a.labels ? { label: { show: true, position: 'top' } } : {}),
            ...(a.refLine && i === 0 && !channel
                ? {
                      markLine: {
                          data: [
                              {
                                  uuid: 'ref-1',
                                  yAxis: '500',
                                  name: 'Target',
                              },
                          ],
                      },
                  }
                : {}),
        }));
    };
    const series = a.savedSeries ? yFields.flatMap(expand) : undefined;
    const legend =
        a.legend === undefined
            ? undefined
            : a.legend === 'hidden'
              ? { show: false }
              : a.legend === 'vertical'
                ? { show: true, orient: 'vertical' as const, right: '0' }
                : a.legend === 'selected'
                  ? {
                        show: true,
                        selected: { count: false, 'Orders count': false },
                    }
                  : { show: true, placement: a.legend };
    const chartConfig: ChartConfig = {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: x,
                yField: yFields,
                flipAxes: a.flip,
                ...(a.stack ? { stack: a.stack } : {}),
                ...(a.colorByCategory ? { colorByCategory: true } : {}),
            },
            eChartsConfig: {
                ...(series ? { series } : {}),
                ...(legend ? { legend } : {}),
                ...(a.sort || a.dataZoom
                    ? {
                          xAxis: [
                              {
                                  ...(a.sort === 'category'
                                      ? { sortType: XAxisSortType.CATEGORY }
                                      : {}),
                                  ...(a.sort === 'bar_totals'
                                      ? { sortType: XAxisSortType.BAR_TOTALS }
                                      : {}),
                                  ...(a.sort === 'inverse'
                                      ? { inverse: true }
                                      : {}),
                                  ...(a.dataZoom
                                      ? { enableDataZoom: true }
                                      : {}),
                              },
                          ],
                      }
                    : {}),
                ...(a.twoAxes
                    ? { yAxis: [{ name: 'Left' }, { name: 'Right' }] }
                    : {}),
            },
            ...(a.rowLimit
                ? {
                      rowLimit: {
                          mode: 'show' as const,
                          direction: 'first' as const,
                          count: 3,
                      },
                  }
                : {}),
            ...(a.condFormat
                ? {
                      conditionalFormattings: [
                          {
                              target: { fieldId: yFields[0] },
                              color: '#ff0000',
                              rules: [
                                  {
                                      id: 'r1',
                                      operator: FilterOperator.GREATER_THAN,
                                      values: [700],
                                  },
                              ],
                              applyTo: ConditionalFormattingColorApplyTo.CELL,
                          },
                      ],
                  }
                : {}),
        },
    };
    const base = a.pivot === 'sql' ? sqlPivotedResults : results;
    return {
        name: JSON.stringify(a),
        chartConfig,
        pivotColumns,
        results: a.tz ? withTimezone(base, a.tz) : base,
    };
};

export const DEFAULT_AXES: Axes = {
    x: 'orders_status',
    y: ['orders_revenue', 'orders_count'],
    type: 'bar',
    flip: false,
    stack: undefined,
    twoAxes: false,
    refLine: false,
    sort: undefined,
    rowLimit: false,
    dataZoom: false,
    legend: undefined,
    condFormat: false,
    colorByCategory: false,
    tz: undefined,
    pivot: undefined,
    savedSeries: true,
    labels: false,
};

const VARIANTS: { [K in keyof Axes]: Axes[K][] } = {
    x: X_CHOICES,
    y: Y_CHOICES,
    type: ['bar', 'line', 'area', 'scatter', 'mix'],
    flip: [false, true],
    stack: [undefined, 'stack', 'stack100'],
    twoAxes: [false, true],
    refLine: [false, true],
    sort: [undefined, 'category', 'bar_totals', 'inverse'],
    rowLimit: [false, true],
    dataZoom: [false, true],
    legend: [
        undefined,
        'hidden',
        'outsideRight',
        'outsideLeft',
        'vertical',
        'selected',
    ],
    condFormat: [false, true],
    colorByCategory: [false, true],
    tz: [undefined, 'America/New_York', 'Asia/Kolkata'],
    pivot: [undefined, 'client', 'sql'],
    savedSeries: [true, false],
    labels: [false, true],
};

export const cartesianCases = (randomCount: number): CartesianCase[] => {
    const cases: CartesianCase[] = [];
    // one factor at a time
    (Object.keys(VARIANTS) as (keyof Axes)[]).forEach((key) => {
        (VARIANTS[key] as unknown[]).forEach((v) => {
            if (JSON.stringify(v) === JSON.stringify(DEFAULT_AXES[key])) return;
            cases.push(buildCartesianCase({ ...DEFAULT_AXES, [key]: v }));
        });
    });
    // one-factor with date x
    ['tz', 'sort', 'rowLimit', 'dataZoom', 'stack'].forEach((key) => {
        (VARIANTS[key as keyof Axes] as unknown[]).forEach((v) => {
            cases.push(
                buildCartesianCase({
                    ...DEFAULT_AXES,
                    x: 'orders_created_at',
                    type: 'line',
                    [key]: v,
                }),
            );
        });
    });
    const r = rng(42);
    for (let i = 0; i < randomCount; i += 1) {
        const a = Object.fromEntries(
            (Object.keys(VARIANTS) as (keyof Axes)[]).map((k) => [
                k,
                pick(r, VARIANTS[k] as unknown[]),
            ]),
        ) as Axes;
        cases.push(buildCartesianCase(a));
    }
    return cases;
};

/* ---------------- other chart types ---------------- */
export const otherCases = (): { name: string; chartConfig: ChartConfig }[] => {
    const out: { name: string; chartConfig: ChartConfig }[] = [];
    const add = (name: string, chartConfig: ChartConfig) =>
        out.push({ name, chartConfig });
    // pie
    [
        {},
        { isDonut: true },
        { valueLabel: 'outside' as const, showPercentage: true },
        { valueLabel: 'inside' as const, showValue: true },
        { showLegend: false },
        { legendPosition: 'vertical' as const },
        { groupLabelOverrides: { completed: 'Done' } },
        { groupColorOverrides: { shipped: '#abcdef' } },
        { groupSortOverrides: ['returned', 'completed', 'shipped', 'pending'] },
        {
            groupValueOptionOverrides: {
                completed: { valueLabel: 'hidden' as const },
            },
        },
        { groupFieldIds: ['orders_status', 'orders_channel'] },
        { groupFieldIds: ['orders_created_day'] },
        { groupFieldIds: ['missing_dim'] },
        { metricId: 'missing_metric' },
        { metricId: 'orders_profit' },
        { metricId: 'margin' },
        { legendMaxItemLength: 5 },
    ].forEach((o, i) =>
        add(`pie ${i} ${JSON.stringify(o)}`, {
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['orders_status'],
                metricId: 'orders_revenue',
                ...o,
            },
        }),
    );
    // funnel
    [
        { dataInput: FunnelChartDataInput.ROW, fieldId: 'orders_revenue' },
        { dataInput: FunnelChartDataInput.COLUMN },
        { dataInput: FunnelChartDataInput.ROW, fieldId: 'orders_profit' },
        { dataInput: FunnelChartDataInput.ROW, fieldId: 'missing' },
        {
            dataInput: FunnelChartDataInput.ROW,
            fieldId: 'orders_revenue',
            showLegend: true,
            legendPosition: 'vertical' as const,
        },
        {
            dataInput: FunnelChartDataInput.ROW,
            fieldId: 'orders_revenue',
            labels: {
                position: 'left' as const,
                showValue: true,
                showPercentage: true,
            },
        },
        {
            dataInput: FunnelChartDataInput.ROW,
            fieldId: 'orders_revenue',
            colorOverrides: { completed: '#ff00ff' },
            labelOverrides: { completed: 'Done' },
        },
    ].forEach((o, i) =>
        add(`funnel ${i} ${JSON.stringify(o)}`, {
            type: ChartType.FUNNEL,
            config: o as never,
        }),
    );
    // treemap
    [
        { groupFieldIds: ['orders_status'], sizeMetricId: 'orders_revenue' },
        {
            groupFieldIds: ['orders_status', 'orders_channel'],
            sizeMetricId: 'orders_revenue',
            colorMetricId: 'orders_profit',
        },
        {
            groupFieldIds: ['orders_status'],
            sizeMetricId: 'orders_revenue',
            useDynamicColors: true,
            startColor: '#000000',
            endColor: '#ffffff',
            startColorThreshold: 0,
            endColorThreshold: 900,
        },
        { groupFieldIds: ['orders_status'], visibleMin: 100, leafDepth: 1 },
        { groupFieldIds: ['missing'], sizeMetricId: 'missing' },
        {},
    ].forEach((o, i) =>
        add(`treemap ${i} ${JSON.stringify(o)}`, {
            type: ChartType.TREEMAP,
            config: o,
        }),
    );
    // gauge
    [
        { selectedField: 'orders_revenue', min: 0, max: 5000 },
        { selectedField: 'orders_revenue' },
        { selectedField: 'orders_count', maxFieldId: 'orders_revenue' },
        {
            selectedField: 'orders_revenue',
            min: 0,
            max: 2000,
            sections: [
                { min: 0, max: 500, color: '#ff0000' },
                { min: 500, max: 2000, color: '#00ff00' },
            ],
            showAxisLabels: true,
        },
        {
            selectedField: 'orders_revenue',
            max: 2000,
            showPercentage: true,
            customPercentageLabel: 'of target',
            customLabel: 'Rev',
        },
        { selectedField: 'orders_profit', min: -500, max: 500 },
        { selectedField: 'missing' },
        {},
    ].forEach((o, i) =>
        add(`gauge ${i} ${JSON.stringify(o)}`, {
            type: ChartType.GAUGE,
            config: o,
        }),
    );
    // sankey
    [
        {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'orders_revenue',
        },
        {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'orders_revenue',
            orient: 'vertical' as const,
            nodeAlign: 'left' as const,
        },
        {
            sourceFieldId: 'orders_channel',
            targetFieldId: 'bucket',
            metricFieldId: 'orders_count',
        },
        {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_status',
            metricFieldId: 'orders_revenue',
        },
        {
            sourceFieldId: 'orders_status',
            targetFieldId: 'orders_channel',
            metricFieldId: 'orders_profit',
        },
        { sourceFieldId: 'missing' },
        {},
    ].forEach((o, i) =>
        add(`sankey ${i} ${JSON.stringify(o)}`, {
            type: ChartType.SANKEY,
            config: o,
        }),
    );
    // table
    [
        {},
        { showColumnCalculation: true, showRowCalculation: true },
        {
            columns: {
                orders_revenue: { visible: false },
                missing: { name: 'Gone' },
                orders_status: { name: 'State', frozen: true },
            },
        },
        { showSubtotals: true },
        { showTableNames: true, hideRowNumbers: true },
    ].forEach((o, i) =>
        add(`table ${i} ${JSON.stringify(o)}`, {
            type: ChartType.TABLE,
            config: o,
        }),
    );
    // big number
    [
        { selectedField: 'orders_revenue' },
        {},
        { selectedField: 'missing' },
        { selectedField: 'orders_status' },
        { selectedField: 'orders_created_day' },
        {
            selectedField: 'orders_revenue',
            showComparison: true,
            comparisonFormat: 'percentage' as never,
        },
        { selectedField: 'margin', label: 'M' },
    ].forEach((o, i) =>
        add(`bigNumber ${i} ${JSON.stringify(o)}`, {
            type: ChartType.BIG_NUMBER,
            config: o,
        }),
    );
    add('custom 0', {
        type: ChartType.CUSTOM,
        config: { spec: { mark: 'bar' } },
    });
    return out;
};

/* ---------------- pivoted tables ---------------- */
export const pivotTableCases = (): {
    name: string;
    chartConfig: ChartConfig;
    pivotColumns: string[];
    results: Results;
}[] => {
    const configs = [
        {},
        { showColumnCalculation: true },
        { showRowCalculation: true },
        { showColumnCalculation: true, showRowCalculation: true },
        { metricsAsRows: true },
        { metricsAsRows: true, showColumnCalculation: true },
        { columns: { orders_revenue: { visible: false } } },
        { columns: { orders_count: { name: 'Orders', frozen: true } } },
        { showTableNames: true, hideRowNumbers: true },
        { showSubtotals: true },
        { showResultsTotal: true },
    ];
    return [
        ...configs.map((config, i) => ({
            name: `pivot table ${i} ${JSON.stringify(config)}`,
            chartConfig: { type: ChartType.TABLE, config } as ChartConfig,
            pivotColumns: ['orders_channel'],
            results: sqlPivotedResults,
        })),
        ...configs.map((config, i) => ({
            name: `raw pivot table ${i} ${JSON.stringify(config)}`,
            chartConfig: { type: ChartType.TABLE, config } as ChartConfig,
            pivotColumns: ['orders_channel'],
            results,
        })),
    ];
};
