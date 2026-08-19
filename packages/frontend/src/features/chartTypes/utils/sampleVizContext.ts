import {
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    type DataAppVizContext,
    type DataAppVizField,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
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

/**
 * Deterministic `DataAppVizContext` fabricated from a declared schema alone,
 * so previews can render without real data.
 */
export const buildSampleVizContext = (
    schema: DataAppVizSchema,
    colorPalette: string[] = ECHARTS_DEFAULT_COLORS,
    optionValues: DataAppVizOptionValues = {},
): DataAppVizContext => {
    const dimensions = schema.fields.filter((f) => f.type === 'dimension');
    const series = schema.fields.filter((f) => f.type === 'series');
    const metrics = schema.fields.filter((f) => f.type === 'metric');

    const fieldMapping = Object.fromEntries(
        schema.fields.map((field) => [field.name, sampleColumnId(field)]),
    );

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

    return {
        fieldMapping,
        rows,
        options: getEffectiveOptionValues(schema.configOptions, optionValues),
        colorPalette,
        pivotDetails: null,
        // Sample rows come from no query — there is nothing to drill into.
        underlyingData: { enabled: false },
    };
};
