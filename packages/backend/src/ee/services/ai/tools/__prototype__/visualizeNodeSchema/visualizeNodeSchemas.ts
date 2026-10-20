/**
 * PROTOTYPE (ZAP-1278) — throwaway. Two candidate LLM-facing schemas for a
 * `visualizeNode` tool, both producing classic `ChartConfig` for a presented
 * composer node, validated against the node's result columns.
 *
 *   A: runQuery's flat tool args generalised to every chart type, converted
 *      server-side to ChartConfig.
 *   B: a reduced classic ChartConfig subset written directly by the model.
 */
import {
    CartesianSeriesType,
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    type ChartConfig,
    type DataAppVizField,
    type PivotConfiguration,
    type ResultColumn,
    type ResultColumns,
} from '@lightdash/common';
import { z } from 'zod';

// ---------------------------------------------------------------- columns

export type ColumnField = {
    fieldType: FieldType;
    type: DimensionType | MetricType;
    label: string;
    format?: string;
};

const isNumeric = (c: ResultColumn) => c.type === DimensionType.NUMBER;
const isTemporal = (c: ResultColumn) =>
    c.type === DimensionType.DATE || c.type === DimensionType.TIMESTAMP;

/** Result columns as chart fields: numbers are metrics, the rest dimensions. */
export const columnsToFields = (
    columns: ResultColumns,
): Record<string, ColumnField> =>
    Object.fromEntries(
        Object.values(columns).map((c) => [
            c.reference,
            isNumeric(c)
                ? {
                      fieldType: FieldType.METRIC,
                      type: MetricType.NUMBER,
                      label: c.label ?? c.reference,
                      format: c.format,
                  }
                : {
                      fieldType: FieldType.DIMENSION,
                      type: c.type,
                      label: c.label ?? c.reference,
                      format: c.format,
                  },
        ]),
    );

// ---------------------------------------------------------------- schema A

const ref = z.string().min(1);

export const schemaA = z.object({
    nodeId: z.string().describe('The composer node to visualize.'),
    chartType: z.enum([
        'table',
        'bar',
        'horizontal',
        'line',
        'area',
        'scatter',
        'pie',
        'funnel',
        'big_number',
        'custom',
    ]),
    x: ref
        .nullable()
        .describe(
            'Column reference for the x axis (bar/line/area/scatter/horizontal) or the slice label (pie/funnel). null for big_number, table, custom.',
        ),
    y: z
        .array(ref)
        .nullable()
        .describe(
            'Numeric column references drawn as values: y axes, pie metric, the big number. null for table/custom.',
        ),
    groupBy: z
        .array(ref)
        .nullable()
        .describe(
            'Low-cardinality columns that split y into one series per value. Never include x. null for a single series.',
        ),
    stack: z.boolean().nullable().describe('Stack bars/areas. Only with groupBy or several y.'),
    secondaryY: ref.nullable().describe('One y column drawn on a right-hand axis.'),
    xAxisLabel: z.string().nullable(),
    yAxisLabel: z.string().nullable(),
    customChartTypeSlug: z
        .string()
        .nullable()
        .describe('chartType "custom" only: slug of the installed custom chart type.'),
    fieldMapping: z
        .record(z.string(), z.union([ref, z.array(ref)]))
        .nullable()
        .describe('chartType "custom" only: slot name → column reference(s).'),
});
export type ArgsA = z.infer<typeof schemaA>;

// ---------------------------------------------------------------- schema B

const seriesB = z.object({
    type: z.enum(['bar', 'line', 'area', 'scatter']),
    encode: z.object({
        xRef: z.object({ field: ref }),
        yRef: z.object({ field: ref }),
    }),
    stack: z.string().nullable().describe('Stack group name; same name stacks together.'),
    yAxisIndex: z.number().int().min(0).max(1).nullable(),
});

export const schemaB = z.object({
    nodeId: z.string().describe('The composer node to visualize.'),
    /** Dimension columns whose values become one series each (pivot). */
    pivotColumns: z
        .array(ref)
        .nullable()
        .describe('Columns to pivot into series (the group-by). null for none.'),
    chartConfig: z.discriminatedUnion('type', [
        z.object({ type: z.literal('table') }),
        z.object({
            type: z.literal('cartesian'),
            config: z.object({
                layout: z.object({
                    xField: ref,
                    yField: z.array(ref).min(1),
                    flipAxes: z.boolean().nullable(),
                }),
                eChartsConfig: z.object({
                    series: z.array(seriesB).min(1),
                    xAxis: z.array(z.object({ name: z.string().nullable() })).nullable(),
                    yAxis: z.array(z.object({ name: z.string().nullable() })).nullable(),
                }),
            }),
        }),
        z.object({
            type: z.literal('pie'),
            config: z.object({ groupFieldIds: z.array(ref).min(1), metricId: ref }),
        }),
        z.object({
            type: z.literal('funnel'),
            config: z.object({ fieldId: ref }),
        }),
        z.object({
            type: z.literal('big_number'),
            config: z.object({ selectedField: ref, label: z.string().nullable() }),
        }),
        z.object({
            type: z.literal('data_app_viz'),
            config: z.object({
                customChartTypeSlug: z.string(),
                fieldMapping: z.record(z.string(), z.union([ref, z.array(ref)])),
            }),
        }),
    ]),
});
export type ArgsB = z.infer<typeof schemaB>;

// ------------------------------------------------------------- conversion

export type Resolved = {
    chartConfig: ChartConfig;
    pivotColumns: string[];
    customChartTypeSlug: string | null;
};

const seriesType = (t: ArgsA['chartType']): CartesianSeriesType => {
    switch (t) {
        case 'line':
        case 'area':
            return CartesianSeriesType.LINE;
        case 'scatter':
            return CartesianSeriesType.SCATTER;
        default:
            return CartesianSeriesType.BAR;
    }
};

export const resolveA = (a: ArgsA): Resolved => {
    const pivotColumns = a.groupBy ?? [];
    const none = { pivotColumns, customChartTypeSlug: null };
    switch (a.chartType) {
        case 'table':
            return { ...none, chartConfig: { type: ChartType.TABLE, config: {} } };
        case 'big_number':
            return {
                ...none,
                chartConfig: {
                    type: ChartType.BIG_NUMBER,
                    config: { selectedField: a.y?.[0] },
                },
            };
        case 'pie':
            return {
                ...none,
                chartConfig: {
                    type: ChartType.PIE,
                    config: { groupFieldIds: [a.x ?? ''], metricId: a.y?.[0] },
                },
            };
        case 'funnel':
            return {
                ...none,
                chartConfig: { type: ChartType.FUNNEL, config: { fieldId: a.y?.[0] } },
            };
        case 'custom':
            return {
                pivotColumns: [],
                customChartTypeSlug: a.customChartTypeSlug,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: `slug:${a.customChartTypeSlug}`,
                        fieldMapping: a.fieldMapping ?? {},
                    },
                },
            };
        default: {
            const y = a.y ?? [];
            // The model may list the secondary field in y too; it is one series.
            const all = a.secondaryY && !y.includes(a.secondaryY) ? [...y, a.secondaryY] : y;
            return {
                ...none,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: a.x ?? undefined,
                            yField: all,
                            flipAxes: a.chartType === 'horizontal',
                            stack: !!a.stack,
                        },
                        eChartsConfig: {
                            legend: { show: true, type: 'scroll' },
                            grid: { containLabel: true },
                            xAxis: [{ ...(a.xAxisLabel ? { name: a.xAxisLabel } : {}) }],
                            yAxis: [{ ...(a.yAxisLabel ? { name: a.yAxisLabel } : {}) }, {}],
                            series: all.map((f) => ({
                                type: seriesType(a.chartType),
                                yAxisIndex: f === a.secondaryY ? 1 : 0,
                                ...(a.chartType === 'area' ? { areaStyle: {} } : {}),
                                ...(a.stack ? { stack: 'stack' } : {}),
                                encode: { xRef: { field: a.x ?? '' }, yRef: { field: f } },
                            })),
                        },
                    },
                },
            };
        }
    }
};

export const resolveB = (b: ArgsB): Resolved => {
    const pivotColumns = b.pivotColumns ?? [];
    const cc = b.chartConfig;
    switch (cc.type) {
        case 'table':
            return { pivotColumns, customChartTypeSlug: null, chartConfig: { type: ChartType.TABLE, config: {} } };
        case 'big_number':
            return {
                pivotColumns,
                customChartTypeSlug: null,
                chartConfig: {
                    type: ChartType.BIG_NUMBER,
                    config: { selectedField: cc.config.selectedField, label: cc.config.label ?? undefined },
                },
            };
        case 'pie':
            return { pivotColumns, customChartTypeSlug: null, chartConfig: { type: ChartType.PIE, config: cc.config } };
        case 'funnel':
            return { pivotColumns, customChartTypeSlug: null, chartConfig: { type: ChartType.FUNNEL, config: cc.config } };
        case 'data_app_viz':
            return {
                pivotColumns: [],
                customChartTypeSlug: cc.config.customChartTypeSlug,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: { dataAppVizUuid: `slug:${cc.config.customChartTypeSlug}`, fieldMapping: cc.config.fieldMapping },
                },
            };
        case 'cartesian': {
            const stacked = cc.config.eChartsConfig.series.some((s) => s.stack);
            return {
                pivotColumns,
                customChartTypeSlug: null,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: cc.config.layout.xField,
                            yField: cc.config.layout.yField,
                            flipAxes: cc.config.layout.flipAxes ?? false,
                            stack: stacked,
                        },
                        eChartsConfig: {
                            legend: { show: true, type: 'scroll' },
                            grid: { containLabel: true },
                            xAxis: (cc.config.eChartsConfig.xAxis ?? [{ name: null }]).map((ax) => ({ ...(ax.name ? { name: ax.name } : {}) })),
                            yAxis: [...(cc.config.eChartsConfig.yAxis ?? [{ name: null }]), { name: null }].slice(0, 2).map((ax) => ({ ...(ax.name ? { name: ax.name } : {}) })),
                            series: cc.config.eChartsConfig.series.map((s) => ({
                                type: s.type === 'area' ? CartesianSeriesType.LINE : (s.type as CartesianSeriesType),
                                ...(s.type === 'area' ? { areaStyle: {} } : {}),
                                yAxisIndex: s.yAxisIndex ?? 0,
                                ...(s.stack ? { stack: s.stack } : {}),
                                encode: s.encode,
                            })),
                        },
                    },
                },
            };
        }
    }
};

// ------------------------------------------------------------- validation

export type CustomTypeLookup = (slug: string) => DataAppVizField[] | null;

/** Model-facing errors; empty when the config fits the columns. */
export const validateResolved = (
    r: Resolved,
    columns: ResultColumns,
    lookupCustomType: CustomTypeLookup,
): string[] => {
    const errors: string[] = [];
    const known = (f: string | undefined, role: string) => {
        if (!f) errors.push(`${role} is required.`);
        else if (!columns[f]) errors.push(`${role} "${f}" is not a column of this node. Columns: ${Object.keys(columns).join(', ')}.`);
    };
    const numeric = (f: string | undefined, role: string) => {
        known(f, role);
        if (f && columns[f] && !isNumeric(columns[f])) errors.push(`${role} "${f}" must be a number column (it is ${columns[f].type}).`);
    };
    const { chartConfig } = r;
    switch (chartConfig.type) {
        case ChartType.TABLE:
            break;
        case ChartType.BIG_NUMBER:
            numeric(chartConfig.config?.selectedField, 'big number field');
            break;
        case ChartType.PIE:
            chartConfig.config?.groupFieldIds?.forEach((g) => known(g, 'pie group'));
            numeric(chartConfig.config?.metricId, 'pie metric');
            break;
        case ChartType.FUNNEL:
            numeric(chartConfig.config?.fieldId, 'funnel field');
            break;
        case ChartType.CARTESIAN: {
            const layout = chartConfig.config?.layout;
            known(layout?.xField, 'x');
            if (!layout?.yField?.length) errors.push('at least one y column is required.');
            layout?.yField?.forEach((y) => numeric(y, 'y'));
            r.pivotColumns.forEach((g) => {
                known(g, 'groupBy');
                if (g === layout?.xField) errors.push(`groupBy must not include the x column "${g}".`);
                if (columns[g] && isNumeric(columns[g])) errors.push(`groupBy "${g}" is a number column; group by a category.`);
            });
            chartConfig.config?.eChartsConfig.series?.forEach((s) => {
                if (s.encode.xRef.field !== layout?.xField) errors.push(`series x "${s.encode.xRef.field}" must equal layout.xField.`);
                if (!layout?.yField.includes(s.encode.yRef.field)) errors.push(`series y "${s.encode.yRef.field}" must be in layout.yField.`);
            });
            break;
        }
        case ChartType.DATA_APP_VIZ: {
            const slug = r.customChartTypeSlug ?? '';
            const slots = lookupCustomType(slug);
            if (!slots) {
                errors.push(`custom chart type "${slug}" is not installed.`);
                break;
            }
            const mapping = chartConfig.config?.fieldMapping ?? {};
            slots.forEach((slot) => {
                const bound = mapping[slot.name];
                const ids = bound === undefined ? [] : Array.isArray(bound) ? bound : [bound];
                if (slot.required && ids.length === 0) errors.push(`slot "${slot.name}" is required.`);
                if (!slot.multiple && ids.length > 1) errors.push(`slot "${slot.name}" takes one column.`);
                ids.forEach((id) => {
                    known(id, `slot "${slot.name}"`);
                    const col = columns[id];
                    if (!col) return;
                    if (slot.type === 'metric' && !isNumeric(col)) errors.push(`slot "${slot.name}" needs a number column; "${id}" is ${col.type}.`);
                    if ((slot.type === 'dimension' || slot.type === 'series') && isNumeric(col)) errors.push(`slot "${slot.name}" needs a category/date column; "${id}" is a number.`);
                });
            });
            Object.keys(mapping).forEach((name) => {
                if (!slots.some((s) => s.name === name)) errors.push(`"${name}" is not a slot of "${slug}". Slots: ${slots.map((s) => s.name).join(', ')}.`);
            });
            break;
        }
        default:
            errors.push(`chart type ${chartConfig.type} is not supported for composer nodes.`);
    }
    return errors;
};

// ----------------------------------------------------------------- pivot

/** The pivot the compose engine must run for a cartesian chart with groupBy. */
export const pivotFor = (r: Resolved, columns: ResultColumns): PivotConfiguration | null => {
    if (r.chartConfig.type !== ChartType.CARTESIAN || r.pivotColumns.length === 0) return null;
    const layout = r.chartConfig.config?.layout;
    if (!layout?.xField) return null;
    const x = columns[layout.xField];
    return {
        indexColumn: { reference: layout.xField, type: x && isTemporal(x) ? 'time' : 'category' } as PivotConfiguration['indexColumn'],
        valuesColumns: layout.yField.map((reference) => ({ reference, aggregation: VizAggregationOptions.ANY })),
        groupByColumns: r.pivotColumns.map((reference) => ({ reference })),
        sortBy: undefined,
    };
};

// ----------------------------------------------------- panel edit-back

export type EditableLayout = {
    kind: 'table' | 'bar' | 'line' | 'scatter' | 'pie' | 'big_number' | 'custom';
    x: string | null;
    y: string[];
    groupBy: string[];
    stack: boolean;
};

/** What the viz config panel could edit; null when the config holds detail the panel cannot round-trip. */
export const toEditableLayout = (r: Resolved): EditableLayout | null => {
    const cc = r.chartConfig;
    switch (cc.type) {
        case ChartType.TABLE:
            return { kind: 'table', x: null, y: [], groupBy: [], stack: false };
        case ChartType.BIG_NUMBER:
            return { kind: 'big_number', x: null, y: cc.config?.selectedField ? [cc.config.selectedField] : [], groupBy: [], stack: false };
        case ChartType.PIE:
            return { kind: 'pie', x: cc.config?.groupFieldIds?.[0] ?? null, y: cc.config?.metricId ? [cc.config.metricId] : [], groupBy: [], stack: false };
        case ChartType.DATA_APP_VIZ:
            return { kind: 'custom', x: null, y: [], groupBy: [], stack: false };
        case ChartType.CARTESIAN: {
            const series = cc.config?.eChartsConfig.series ?? [];
            const types = new Set(series.map((s) => s.type));
            const axes = new Set(series.map((s) => s.yAxisIndex ?? 0));
            // Mixed series types or a secondary axis are beyond the panel's vocabulary.
            if (types.size > 1 || axes.size > 1) return null;
            const t = [...types][0];
            return {
                kind: t === CartesianSeriesType.LINE ? 'line' : t === CartesianSeriesType.SCATTER ? 'scatter' : 'bar',
                x: cc.config?.layout.xField ?? null,
                y: cc.config?.layout.yField ?? [],
                groupBy: r.pivotColumns,
                stack: !!cc.config?.layout.stack,
            };
        }
        default:
            return null;
    }
};
