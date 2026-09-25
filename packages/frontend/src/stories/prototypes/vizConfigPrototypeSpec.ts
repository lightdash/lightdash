// PROTOTYPE — throwaway data, config and spec builder for the composer viz config stories.
import {
    BigNumberDataModel,
    CartesianChartDataModel,
    ChartKind,
    DimensionType,
    ECHARTS_DEFAULT_COLORS,
    getColumnAxisType,
    PieChartDataModel,
    ValueLabelPositionOptions,
    VizAggregationOptions,
    type AnyType,
    type BigNumberSpec,
    type CartesianChartDisplay,
    type PivotChartData,
    type PivotChartLayout,
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import { SqlChartResultsRunner } from '../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';

export type Kind = 'table' | 'bar' | 'line' | 'pie' | 'big_number';

export type VizConfig = {
    kind: Kind;
    x: string | null;
    y: { reference: string; aggregation: VizAggregationOptions }[];
    groupBy: string | null;
    sort: 'none' | 'value_desc' | 'value_asc';
    stack: boolean;
    legend: boolean;
    valueLabels: boolean;
    xLabel: string;
    yLabel: string;
};

export const INITIAL_CONFIG: VizConfig = {
    kind: 'line',
    x: 'month',
    y: [{ reference: 'revenue', aggregation: VizAggregationOptions.SUM }],
    groupBy: 'region',
    sort: 'none',
    stack: false,
    legend: true,
    valueLabels: false,
    xLabel: '',
    yLabel: '',
};

export const COLUMNS: ResultColumn[] = [
    { reference: 'month', type: DimensionType.DATE },
    { reference: 'region', type: DimensionType.STRING },
    { reference: 'revenue', type: DimensionType.NUMBER },
    { reference: 'orders', type: DimensionType.NUMBER },
    { reference: 'avg_order_value', type: DimensionType.NUMBER },
];

const columnType = (reference: string) =>
    COLUMNS.find((c) => c.reference === reference)?.type ??
    DimensionType.STRING;

export const isNumeric = (reference: string) =>
    columnType(reference) === DimensionType.NUMBER;

const MONTHS = ['01', '02', '03', '04', '05', '06'].map((m) => `2026-${m}-01`);
const REGIONS: Record<string, { base: number; growth: number; aov: number }> = {
    EMEA: { base: 182000, growth: 0.045, aov: 118 },
    APAC: { base: 121000, growth: 0.082, aov: 94 },
    AMER: { base: 246000, growth: 0.021, aov: 136 },
};

export const ROWS: RawResultRow[] = MONTHS.flatMap((month, i) =>
    Object.entries(REGIONS).map(([region, { base, growth, aov }]) => {
        const wobble = 1 + ((i * 7 + region.length * 3) % 5) * 0.012;
        const revenue = Math.round(base * (1 + growth) ** i * wobble);
        const avgOrderValue = Math.round((aov + i * 1.7) * 100) / 100;
        return {
            month,
            region,
            revenue,
            orders: Math.round(revenue / avgOrderValue),
            avg_order_value: avgOrderValue,
        };
    }),
);

const aggregate = (values: number[], agg: VizAggregationOptions) => {
    if (values.length === 0) return null;
    switch (agg) {
        case VizAggregationOptions.SUM:
            return values.reduce((a, b) => a + b, 0);
        case VizAggregationOptions.AVERAGE:
            return (
                Math.round(
                    (values.reduce((a, b) => a + b, 0) / values.length) * 100,
                ) / 100
            );
        case VizAggregationOptions.MIN:
            return Math.min(...values);
        case VizAggregationOptions.MAX:
            return Math.max(...values);
        case VizAggregationOptions.COUNT:
            return values.length;
        default:
            return values[0];
    }
};

const aggregateRows = (
    rows: RawResultRow[],
    y: VizConfig['y'][number],
): number | null =>
    aggregate(
        rows.map((r) => Number(r[y.reference])),
        y.aggregation,
    );

const distinct = (reference: string) => [
    ...new Set(ROWS.map((r) => String(r[reference]))),
];

const pivot = (
    config: VizConfig,
    x: string,
    groupBy: string | null,
): { data: PivotChartData; layout: PivotChartLayout } => {
    const groups = groupBy ? distinct(groupBy) : [null];
    const valuesColumns = config.y.flatMap((y) =>
        groups.map((g) => ({
            referenceField: y.reference,
            pivotColumnName: g ? `${y.reference}_${g}` : y.reference,
            aggregation: y.aggregation,
            pivotValues:
                g && groupBy ? [{ referenceField: groupBy, value: g }] : [],
        })),
    );
    let results: RawResultRow[] = distinct(x).map((xValue) => {
        const row: RawResultRow = { [x]: xValue };
        config.y.forEach((y) =>
            groups.forEach((g) => {
                const matching = ROWS.filter(
                    (r) =>
                        String(r[x]) === xValue &&
                        (!g || !groupBy || String(r[groupBy]) === g),
                );
                row[g ? `${y.reference}_${g}` : y.reference] = aggregateRows(
                    matching,
                    y,
                );
            }),
        );
        return row;
    });
    if (config.sort !== 'none') {
        const dir = config.sort === 'value_desc' ? 1 : -1;
        const total = (row: RawResultRow) =>
            valuesColumns.reduce(
                (sum, c) => sum + Number(row[c.pivotColumnName] ?? 0),
                0,
            );
        results = [...results].sort((a, b) => dir * (total(b) - total(a)));
    }
    const indexColumn = {
        reference: x,
        type: getColumnAxisType(columnType(x)),
    };
    return {
        data: {
            queryUuid: undefined,
            fileUrl: undefined,
            results,
            indexColumn,
            valuesColumns,
            columns: [
                { reference: x, type: columnType(x) },
                ...valuesColumns.map((c) => ({
                    reference: c.pivotColumnName,
                    type: DimensionType.NUMBER,
                })),
            ],
            columnCount: valuesColumns.length + 1,
        },
        layout: {
            x: indexColumn,
            y: config.y,
            groupBy: groupBy ? [{ reference: groupBy }] : [],
            stack: config.stack,
        },
    };
};

const originalColumns = Object.fromEntries(
    COLUMNS.map((c) => [c.reference, c]),
);

const runnerFor = (pivotChartData: PivotChartData) =>
    new SqlChartResultsRunner({ pivotChartData, originalColumns });

const query = { sql: '', limit: ROWS.length, sortBy: [], filters: [] };

export type PrototypeSpec =
    | { kind: 'table' }
    | { kind: 'echarts'; option: Record<string, AnyType> }
    | { kind: 'big_number'; spec: BigNumberSpec | undefined }
    | { kind: 'empty'; reason: string };

export const buildPrototypeSpec = async (
    config: VizConfig,
): Promise<PrototypeSpec> => {
    const [y] = config.y;
    if (config.kind === 'table') return { kind: 'table' };
    if (!y) return { kind: 'empty', reason: 'Pick a value' };

    if (config.kind === 'big_number') {
        const data: PivotChartData = {
            queryUuid: undefined,
            fileUrl: undefined,
            results: [{ [y.reference]: aggregateRows(ROWS, y) }],
            indexColumn: undefined,
            valuesColumns: [
                {
                    referenceField: y.reference,
                    pivotColumnName: y.reference,
                    aggregation: y.aggregation,
                    pivotValues: [],
                },
            ],
            columns: [{ reference: y.reference, type: DimensionType.NUMBER }],
            columnCount: 1,
        };
        const model = new BigNumberDataModel({
            resultsRunner: runnerFor(data),
            fieldConfig: { x: undefined, y: [y], groupBy: [] },
        });
        await model.getPivotedChartData(query);
        return { kind: 'big_number', spec: model.getSpec() };
    }

    if (!config.x) return { kind: 'empty', reason: 'Pick an X axis' };

    if (config.kind === 'pie') {
        const { data, layout } = pivot({ ...config, y: [y] }, config.x, null);
        const model = new PieChartDataModel({
            resultsRunner: runnerFor(data),
            fieldConfig: { ...layout, groupBy: [] },
        });
        await model.getPivotedChartData(query);
        return {
            kind: 'echarts',
            option: { color: ECHARTS_DEFAULT_COLORS, ...model.getSpec() },
        };
    }

    // With a split only the first value is charted.
    const { data, layout } = pivot(
        config.groupBy ? { ...config, y: [y] } : config,
        config.x,
        config.groupBy,
    );
    const model = new CartesianChartDataModel({
        resultsRunner: runnerFor(data),
        fieldConfig: layout,
        type: config.kind === 'bar' ? ChartKind.VERTICAL_BAR : ChartKind.LINE,
    });
    await model.getPivotedChartData(query);
    const display: CartesianChartDisplay = {
        stack: config.stack,
        legend: config.legend
            ? { position: 'top', align: 'center' }
            : undefined,
        xAxis: { label: config.xLabel || undefined },
        yAxis: [
            {
                label:
                    config.yLabel ||
                    `${AGG_LABELS[config.y[0].aggregation]} of ${config.y[0].reference}`,
            },
        ],
        series: config.valueLabels
            ? Object.fromEntries(
                  config.y.map((v) => [
                      v.reference,
                      {
                          valueLabelPosition:
                              config.kind === 'bar' && config.stack
                                  ? ValueLabelPositionOptions.INSIDE
                                  : ValueLabelPositionOptions.TOP,
                      },
                  ]),
              )
            : undefined,
    };
    const option = model.getSpec(display, ECHARTS_DEFAULT_COLORS);
    // The model decides legend visibility itself; the toggle overrides it.
    return {
        kind: 'echarts',
        option: {
            ...option,
            legend: { ...option.legend, show: config.legend },
        },
    };
};

export const AGG_LABELS: Record<VizAggregationOptions, string> = {
    [VizAggregationOptions.SUM]: 'Sum',
    [VizAggregationOptions.AVERAGE]: 'Average',
    [VizAggregationOptions.MIN]: 'Min',
    [VizAggregationOptions.MAX]: 'Max',
    [VizAggregationOptions.COUNT]: 'Count',
    [VizAggregationOptions.ANY]: 'Any',
};

export const AGG_SYMBOL: Record<VizAggregationOptions, string> = {
    [VizAggregationOptions.SUM]: 'Σ',
    [VizAggregationOptions.AVERAGE]: 'avg',
    [VizAggregationOptions.MIN]: 'min',
    [VizAggregationOptions.MAX]: 'max',
    [VizAggregationOptions.COUNT]: 'count',
    [VizAggregationOptions.ANY]: 'any',
};

export const summarize = (config: VizConfig): string => {
    const [y] = config.y;
    const value = y ? y.reference : '—';
    switch (config.kind) {
        case 'table':
            return `${ROWS.length} rows · ${COLUMNS.length} columns`;
        case 'big_number':
            return `${y ? AGG_SYMBOL[y.aggregation] : ''} ${value}`.trim();
        case 'pie':
            return `${value} by ${config.x ?? '—'}`;
        default:
            return `${config.x ?? '—'} × ${value}${
                config.groupBy ? ` by ${config.groupBy}` : ''
            }`;
    }
};

// Which controls apply to the current kind; the rest dim but keep their place.
export const applies = (kind: Kind) => ({
    x: kind !== 'table' && kind !== 'big_number',
    y: kind !== 'table',
    split: kind === 'bar' || kind === 'line',
    sort: kind === 'bar' || kind === 'line' || kind === 'pie',
    display: kind === 'bar' || kind === 'line',
    stack: kind === 'bar' || kind === 'line',
});

export const KINDS: { kind: Kind; chartKind: ChartKind; label: string }[] = [
    { kind: 'table', chartKind: ChartKind.TABLE, label: 'Table' },
    { kind: 'bar', chartKind: ChartKind.VERTICAL_BAR, label: 'Bar' },
    { kind: 'line', chartKind: ChartKind.LINE, label: 'Line' },
    { kind: 'pie', chartKind: ChartKind.PIE, label: 'Pie' },
    {
        kind: 'big_number',
        chartKind: ChartKind.BIG_NUMBER,
        label: 'Big value',
    },
];
