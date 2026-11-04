import {
    DimensionType,
    isCustomChartTypeSlugChartConfig,
    type ComposerBuiltinChartVizConfig,
    type ComposerChartVizConfig,
    type ResultColumns,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';

const MAX_PIE_SLICES = 6;
const MAX_SERIES = 12;

type Rows = Record<string, unknown>[];

const pieSliceNote = (rows: Rows, dimension: string): string | null => {
    const slices = new Set(rows.map((row) => row[dimension])).size;
    return slices > MAX_PIE_SLICES
        ? `This pie has ${slices} categories; a bar chart or table will make comparisons easier.`
        : null;
};

const seriesNote = (rows: Rows, groups: string[]): string | null => {
    const series = new Set(
        rows.map((row) => JSON.stringify(groups.map((group) => row[group]))),
    ).size;
    return series > MAX_SERIES
        ? `This chart has ${series} series; consider a table or an explicitly requested narrower grouping.`
        : null;
};

export const formatChartReadabilityNotes = (notes: string[]): string =>
    notes.length === 0
        ? ''
        : `Chart readability: ${notes.join(' ')} Do not remove requested categories or change query scope merely to simplify the chart.`;

export const chartQualityHints = (
    query: ToolRunQueryArgsTransformed,
    rows: Rows,
): string => {
    const chart = query.chartConfig;
    if (
        !chart ||
        isCustomChartTypeSlugChartConfig(chart) ||
        chart.defaultVizType === 'table'
    )
        return '';
    const dimension = chart.xAxisDimension;
    const notes = [
        chart.defaultVizType === 'pie' && dimension
            ? pieSliceNote(rows, dimension)
            : null,
        chart.groupBy?.length ? seriesNote(rows, chart.groupBy) : null,
    ].filter((note): note is string => note !== null);
    return notes.length === 0 ? '' : ` ${formatChartReadabilityNotes(notes)}`;
};

const SERIES_SPLIT_TYPES: ComposerBuiltinChartVizConfig['type'][] = [
    'bar',
    'line',
    'area',
    'scatter',
];

const getSeriesSplit = (vizConfig: ComposerBuiltinChartVizConfig) =>
    SERIES_SPLIT_TYPES.includes(vizConfig.type)
        ? (vizConfig.groupBy ?? [])
        : [];

/** Whether composerChartQualityHints may note anything, so reading rows is worth it. */
export const composerChartQualityHintsNeedRows = (
    vizConfig: ComposerChartVizConfig,
): boolean =>
    vizConfig.type !== 'custom' &&
    (vizConfig.type === 'pie' || getSeriesSplit(vizConfig).length > 0);

export const composerChartQualityHints = (
    vizConfig: ComposerChartVizConfig,
    { columns, rows }: { columns: ResultColumns; rows: Rows },
): string[] => {
    if (vizConfig.type === 'custom') return [];
    const groups = getSeriesSplit(vizConfig);
    // A pie without x slices by the first non-numeric column, as it renders.
    const pieDimension =
        vizConfig.x ??
        Object.values(columns).find(
            (column) => column.type !== DimensionType.NUMBER,
        )?.reference ??
        null;
    return [
        vizConfig.type === 'pie' && pieDimension
            ? pieSliceNote(rows, pieDimension)
            : null,
        groups.length > 0 ? seriesNote(rows, groups) : null,
    ].filter((note): note is string => note !== null);
};
