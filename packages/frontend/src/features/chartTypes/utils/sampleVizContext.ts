import {
    DimensionType,
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    getPivotValueColumnName,
    VizAggregationOptions,
    VizIndexType,
    type DataAppVizContext,
    type DataAppVizField,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type PivotValuesColumn,
    type ResultColumn,
    type ResultColumns,
    type ResultRow,
} from '@lightdash/common';

// ISO raw values so vizzes that build a time axis can parse them.
const SAMPLE_CATEGORIES = [
    { raw: '2026-01-01', formatted: 'Jan 2026' },
    { raw: '2026-02-01', formatted: 'Feb 2026' },
    { raw: '2026-03-01', formatted: 'Mar 2026' },
    { raw: '2026-04-01', formatted: 'Apr 2026' },
    { raw: '2026-05-01', formatted: 'May 2026' },
    { raw: '2026-06-01', formatted: 'Jun 2026' },
];
const SAMPLE_SERIES = ['Series A', 'Series B', 'Series C'];

const sampleColumnId = (field: DataAppVizField): string =>
    `sample_${field.name}`;

/** Deterministic pseudo-random metric value. */
const sampleMetricValue = (rowIndex: number, metricIndex: number): number =>
    Math.round(
        20 + 80 * Math.abs(Math.sin((rowIndex + 1) * 3.7 * (metricIndex + 1))),
    );

const cell = (
    raw: string | number,
    formatted: string = String(raw),
): { value: { raw: unknown; formatted: string } } => ({
    value: { raw, formatted },
});

/** Names a spread metric column with the shared pivot rule, so previews resolve
 *  row keys exactly as they do against a real pivoted query. */
const samplePivotColumnName = (
    metric: DataAppVizField,
    seriesValues: string[],
): string =>
    getPivotValueColumnName(
        sampleColumnId(metric),
        VizAggregationOptions.ANY,
        seriesValues,
    );

type SampleFields = {
    dimensions: DataAppVizField[];
    series: DataAppVizField[];
    metrics: DataAppVizField[];
};

const sampleResultColumn = (
    field: DataAppVizField,
    type: DimensionType,
): ResultColumn => ({
    reference: sampleColumnId(field),
    type,
    label: field.label,
});

/** Column metadata for the unpivoted sample shape, which pivoted previews carry
 *  as `pivotDetails.originalColumns`. */
const buildOriginalColumns = ({
    dimensions,
    series,
    metrics,
}: SampleFields): ResultColumns => {
    const columns: ResultColumn[] = [
        ...dimensions.map((field) =>
            sampleResultColumn(field, DimensionType.DATE),
        ),
        ...series.map((field) =>
            sampleResultColumn(field, DimensionType.STRING),
        ),
        ...metrics.map((field) =>
            sampleResultColumn(field, DimensionType.NUMBER),
        ),
    ];
    return Object.fromEntries(
        columns.map((column) => [column.reference, column]),
    );
};

/** One row per category, crossed with the series split. */
const buildFlatSample = ({
    dimensions,
    series,
    metrics,
}: SampleFields): Pick<DataAppVizContext, 'rows' | 'pivotDetails'> => {
    const seriesCount = series.length > 0 ? SAMPLE_SERIES.length : 1;
    const rows: ResultRow[] = [];
    for (let s = 0; s < seriesCount; s++) {
        for (let c = 0; c < SAMPLE_CATEGORIES.length; c++) {
            const row: ResultRow = {};
            dimensions.forEach((field, d) => {
                const month =
                    SAMPLE_CATEGORIES[(c + d) % SAMPLE_CATEGORIES.length];
                row[sampleColumnId(field)] = cell(month.raw, month.formatted);
            });
            series.forEach((field) => {
                row[sampleColumnId(field)] = cell(SAMPLE_SERIES[s]);
            });
            metrics.forEach((field, m) => {
                row[sampleColumnId(field)] = cell(
                    sampleMetricValue(s * SAMPLE_CATEGORIES.length + c, m),
                );
            });
            rows.push(row);
        }
    }
    return { rows, pivotDetails: null };
};

/** The pivoted counterpart of the flat sample: each metric spread into one
 *  column per series value, keyed and described as the backend would. */
const buildPivotedSample = ({
    dimensions,
    series,
    metrics,
}: SampleFields): Pick<DataAppVizContext, 'rows' | 'pivotDetails'> => {
    // Every series slot binds the same sample split, so a pivot column group
    // repeats one series value per slot.
    const seriesValueTuples = SAMPLE_SERIES.map((value) =>
        series.map(() => value),
    );

    const valuesColumns: PivotValuesColumn[] = seriesValueTuples.flatMap(
        (seriesValues, s) =>
            metrics.map((metric) => ({
                referenceField: sampleColumnId(metric),
                pivotColumnName: samplePivotColumnName(metric, seriesValues),
                aggregation: VizAggregationOptions.ANY,
                pivotValues: series.map((field, i) => ({
                    referenceField: sampleColumnId(field),
                    value: seriesValues[i],
                    formatted: seriesValues[i],
                })),
                columnIndex: s + 1,
            })),
    );

    // With no dimension to index on, every flat row collapses onto one row.
    const rowCount = dimensions.length > 0 ? SAMPLE_CATEGORIES.length : 1;
    const rows: ResultRow[] = [];
    for (let c = 0; c < rowCount; c++) {
        const row: ResultRow = {};
        dimensions.forEach((field, d) => {
            const month = SAMPLE_CATEGORIES[(c + d) % SAMPLE_CATEGORIES.length];
            row[sampleColumnId(field)] = cell(month.raw, month.formatted);
        });
        seriesValueTuples.forEach((seriesValues, s) => {
            metrics.forEach((metric, m) => {
                row[samplePivotColumnName(metric, seriesValues)] = cell(
                    sampleMetricValue(s * SAMPLE_CATEGORIES.length + c, m),
                );
            });
        });
        rows.push(row);
    }

    return {
        rows,
        pivotDetails: {
            totalColumnCount: valuesColumns.length,
            // Sample dimensions are always dates.
            indexColumn: dimensions.map((field) => ({
                reference: sampleColumnId(field),
                type: VizIndexType.TIME,
            })),
            valuesColumns,
            groupByColumns: series.map((field) => ({
                reference: sampleColumnId(field),
            })),
            sortBy: undefined,
            originalColumns: buildOriginalColumns({
                dimensions,
                series,
                metrics,
            }),
        },
    };
};

/**
 * Deterministic `DataAppVizContext` fabricated from a declared schema alone,
 * so previews can render without real data.
 */
export const buildSampleVizContext = (
    schema: DataAppVizSchema,
    colorPalette: string[] = ECHARTS_DEFAULT_COLORS,
    optionValues: DataAppVizOptionValues = {},
): DataAppVizContext => {
    const fields: SampleFields = {
        dimensions: schema.fields.filter((f) => f.type === 'dimension'),
        series: schema.fields.filter((f) => f.type === 'series'),
        metrics: schema.fields.filter((f) => f.type === 'metric'),
    };

    // A chart type that declares a series field renders from pivoted rows, so
    // its sample must be pivoted too or it finds no series and draws nothing.
    // A series field with no metric has nothing to spread — as on the backend,
    // that keeps the flat sample.
    const shouldPivot = fields.series.length > 0 && fields.metrics.length > 0;

    return {
        fieldMapping: Object.fromEntries(
            schema.fields.map((field) => [field.name, sampleColumnId(field)]),
        ),
        options: getEffectiveOptionValues(schema.configOptions, optionValues),
        colorPalette,
        seriesColors: {},
        valueColors: {},
        // Sample rows come from no query — there is nothing to drill into.
        underlyingData: { enabled: false },
        drillDown: { enabled: false },
        ...(shouldPivot ? buildPivotedSample(fields) : buildFlatSample(fields)),
    };
};
