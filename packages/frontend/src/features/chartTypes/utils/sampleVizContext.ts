import {
    DimensionType,
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    getEffectiveDataAppVizFieldOptionValues,
    resolveDataAppVizFieldColors,
    getDataAppVizPreviewFieldId,
    getDataAppVizPreviewSchema,
    getPivotValueColumnName,
    VizAggregationOptions,
    VizIndexType,
    type DataAppVizContext,
    type DataAppVizField,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type DataAppVizPreview,
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
    { raw: '2026-07-01', formatted: 'Jul 2026' },
    { raw: '2026-08-01', formatted: 'Aug 2026' },
    { raw: '2026-09-01', formatted: 'Sep 2026' },
    { raw: '2026-10-01', formatted: 'Oct 2026' },
    { raw: '2026-11-01', formatted: 'Nov 2026' },
    { raw: '2026-12-01', formatted: 'Dec 2026' },
];
const SAMPLE_SERIES = ['Series A', 'Series B', 'Series C'];

const sampleColumnId = (field: DataAppVizField): string =>
    getDataAppVizPreviewFieldId(field.name);

/** Deterministic pseudo-random metric value. */
const sampleMetricValue = (rowIndex: number, metricIndex: number): number =>
    Math.round(
        30 * (metricIndex + 1) +
            5 * rowIndex +
            8 * Math.sin((rowIndex + 1) * (metricIndex + 1)),
    );

const cell = (
    raw: string | number | boolean | null,
    formatted: string = raw === null ? '' : String(raw),
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
            totalColumnCount: seriesValueTuples.length,
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

const buildDemoSample = (
    schema: DataAppVizSchema,
    fields: SampleFields,
    demoRows: NonNullable<DataAppVizPreview['rows']>,
    shouldPivot: boolean,
): Pick<DataAppVizContext, 'rows' | 'pivotDetails'> => {
    const rows = demoRows.map((row) =>
        Object.fromEntries(
            schema.fields.map((field) => [
                sampleColumnId(field),
                cell(row[field.name] ?? null),
            ]),
        ),
    );
    if (!shouldPivot) return { rows, pivotDetails: null };

    const { dimensions, series, metrics } = fields;
    const originalColumns = Object.fromEntries(
        schema.fields.map((field) => {
            const raw = demoRows.find((row) => row[field.name] != null)?.[
                field.name
            ];
            const type =
                typeof raw === 'number'
                    ? DimensionType.NUMBER
                    : typeof raw === 'boolean'
                      ? DimensionType.BOOLEAN
                      : typeof raw === 'string' &&
                          /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(raw)
                        ? DimensionType.DATE
                        : DimensionType.STRING;
            return [sampleColumnId(field), sampleResultColumn(field, type)];
        }),
    );
    const valuesColumns = new Map<string, PivotValuesColumn>();
    const groupedRows = new Map<string, ResultRow>();
    const groups = new Map<string, number>();
    for (const source of demoRows) {
        const indexKey = JSON.stringify(
            dimensions.map((field) => source[field.name] ?? null),
        );
        const seriesValues = series.map((field) => source[field.name] ?? null);
        const groupKey = JSON.stringify(seriesValues);
        if (!groups.has(groupKey)) groups.set(groupKey, groups.size + 1);
        let row = groupedRows.get(indexKey);
        if (!row) {
            row = Object.fromEntries(
                dimensions.map((field) => [
                    sampleColumnId(field),
                    cell(source[field.name] ?? null),
                ]),
            );
            groupedRows.set(indexKey, row);
        }
        for (const metric of metrics) {
            const columnName = getPivotValueColumnName(
                sampleColumnId(metric),
                VizAggregationOptions.ANY,
                seriesValues,
            );
            valuesColumns.set(columnName, {
                referenceField: sampleColumnId(metric),
                pivotColumnName: columnName,
                aggregation: VizAggregationOptions.ANY,
                pivotValues: series.map((field, i) => ({
                    referenceField: sampleColumnId(field),
                    value: seriesValues[i],
                    formatted:
                        seriesValues[i] === null ? '' : String(seriesValues[i]),
                })),
                columnIndex: groups.get(groupKey)!,
            });
            // ANY keeps the first value when multiple demo rows share a group.
            row[columnName] ??= cell(source[metric.name] ?? null);
        }
    }
    const pivotedRows = [...groupedRows.values()];
    for (const row of pivotedRows) {
        for (const column of valuesColumns.keys()) row[column] ??= cell(null);
    }
    return {
        rows: pivotedRows,
        pivotDetails: {
            totalColumnCount: valuesColumns.size,
            indexColumn: dimensions.map((field) => ({
                reference: sampleColumnId(field),
                type:
                    originalColumns[sampleColumnId(field)].type ===
                    DimensionType.DATE
                        ? VizIndexType.TIME
                        : VizIndexType.CATEGORY,
            })),
            valuesColumns: [...valuesColumns.values()],
            groupByColumns: series.map((field) => ({
                reference: sampleColumnId(field),
            })),
            sortBy: undefined,
            originalColumns,
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
    preview: DataAppVizPreview | null = null,
): DataAppVizContext => {
    const parsedPreview = getDataAppVizPreviewSchema(schema).safeParse(preview);
    const demo = parsedPreview.success ? parsedPreview.data : null;
    const fields: SampleFields = {
        dimensions: schema.fields.filter((f) => f.type === 'dimension'),
        series: schema.fields.filter((f) => f.type === 'series'),
        // Any-column slots use numeric samples and follow the metric pivot path.
        metrics: schema.fields.filter(
            (f) => f.type === 'metric' || f.type === 'column',
        ),
    };

    // A chart type that declares a series field renders from pivoted rows, so
    // its sample must be pivoted too or it finds no series and draws nothing.
    // A series field with no metric has nothing to spread — as on the backend,
    // that keeps the flat sample.
    const shouldPivot = fields.series.length > 0 && fields.metrics.length > 0;
    const sampleFieldMapping = Object.fromEntries(
        schema.fields.map((field) => [
            field.name,
            field.multiple ? [sampleColumnId(field)] : sampleColumnId(field),
        ]),
    );
    const sampleData = demo?.rows
        ? buildDemoSample(schema, fields, demo.rows, shouldPivot)
        : shouldPivot
          ? buildPivotedSample(fields)
          : buildFlatSample(fields);

    return {
        // One representative column per input keeps the preview readable while
        // collection inputs retain the same array binding contract as real data.
        fieldMapping: sampleFieldMapping,
        fieldOptions: getEffectiveDataAppVizFieldOptionValues(
            schema.fields,
            sampleFieldMapping,
            demo?.fieldOptionValues,
        ),
        fieldColors: resolveDataAppVizFieldColors({
            fields: schema.fields,
            fieldMapping: sampleFieldMapping,
            fieldColorValues: demo?.fieldColorValues,
            rows: sampleData.rows,
            pivotDetails: sampleData.pivotDetails,
        }),
        // Fabricated columns have no semantic-layer item; the declared slot
        // label stands in so previews still show human names.
        fields: Object.fromEntries(
            schema.fields.map((field) => [
                sampleColumnId(field),
                { label: field.label },
            ]),
        ),
        options: getEffectiveOptionValues(schema.configOptions, {
            ...demo?.optionValues,
            ...optionValues,
        }),
        colorPalette,
        seriesColors: {},
        valueColors: {},
        // Sample rows come from no query — there is nothing to drill into.
        underlyingData: { enabled: false },
        drillDown: { enabled: false },
        pointMenu: { enabled: false },
        ...sampleData,
    };
};
