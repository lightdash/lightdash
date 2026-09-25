import { z } from 'zod';
import { type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    getColumnAxisType,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type PivotChartLayout,
    type VizTableConfig,
} from '../../visualizations/types';
import {
    buildComposerVizConfig,
    getComposerFieldConfig,
    getComposerVizPlan,
    isComposerNumericColumn,
    type ComposerChartKind,
    type ComposerVizKind,
} from './composerViz';

/** Switcher order. */
export const COMPOSER_VIZ_KINDS: ComposerVizKind[] = [
    'table',
    'bar',
    'line',
    'pie',
    'big_number',
];

/** The SQL runner's set; ANY first because node results are already aggregated. */
export const COMPOSER_VIZ_AGGREGATIONS: VizAggregationOptions[] = [
    VizAggregationOptions.ANY,
    VizAggregationOptions.SUM,
    VizAggregationOptions.AVERAGE,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.COUNT,
];

export type ComposerVizSort = 'x_order' | 'value_desc' | 'value_asc';

type ComposerChartConfig = Exclude<AllVizChartConfig, VizTableConfig>;

type ResultShape = {
    columns: ResultColumn[];
    rows: RawResultRow[];
    node: SourceQuery | null;
};

const isNumeric = isComposerNumericColumn;

const tableConfig = (): VizTableConfig => ({
    type: ChartKind.TABLE,
    metadata: { version: 1 },
    columns: {},
    display: undefined,
});

const chartKindOfType = (
    type: ComposerChartConfig['type'],
): ComposerChartKind => {
    switch (type) {
        case ChartKind.VERTICAL_BAR:
            return 'bar';
        case ChartKind.LINE:
            return 'line';
        case ChartKind.PIE:
            return 'pie';
        case ChartKind.BIG_NUMBER:
            return 'big_number';
        default:
            return assertUnreachable(type, 'Unknown composer chart type');
    }
};

const chartKindOf = (config: ComposerChartConfig): ComposerChartKind =>
    chartKindOfType(config.type);

const columnsByReference = (columns: ResultColumn[]) =>
    new Map(columns.map((column) => [column.reference, column]));

const layoutOf = (value: AllVizChartConfig): PivotChartLayout | null =>
    value.type === ChartKind.TABLE ? null : (value.fieldConfig ?? null);

/** Every referenced column exists in the result and every y is numeric. */
export const composerVizConfigFitsColumns = (
    vizConfig: AllVizChartConfig,
    columns: ResultColumn[],
): boolean => {
    const known = columnsByReference(columns);
    if (vizConfig.type === ChartKind.TABLE) {
        return Object.keys(vizConfig.columns).every((reference) =>
            known.has(reference),
        );
    }
    const layout = vizConfig.fieldConfig;
    if (!layout || layout.y.length === 0) return false;
    if (
        layout.y.some((y) => {
            const column = known.get(y.reference);
            return !column || !isNumeric(column);
        })
    )
        return false;
    if (vizConfig.type !== ChartKind.BIG_NUMBER && !layout.x) return false;
    if (layout.x && !known.has(layout.x.reference)) return false;
    if ((layout.groupBy ?? []).some((g) => !known.has(g.reference)))
        return false;
    return (layout.sortBy ?? []).every((s) => known.has(s.reference));
};

/** Table always; chart kinds need a numeric column; bar/line/pie also need a second column for x; a big number needs a single row. */
export const getAvailableComposerVizKinds = (
    columns: ResultColumn[],
    rows: RawResultRow[],
): ComposerVizKind[] => {
    const hasNumeric = columns.some(isNumeric);
    return COMPOSER_VIZ_KINDS.filter((kind) => {
        switch (kind) {
            case 'table':
                return true;
            case 'big_number':
                return hasNumeric && rows.length === 1;
            case 'bar':
            case 'line':
            case 'pie':
                return hasNumeric && columns.length >= 2;
            default:
                return assertUnreachable(kind, 'Unknown composer viz kind');
        }
    });
};

const xOf = (column: ResultColumn): PivotChartLayout['x'] => ({
    reference: column.reference,
    type: getColumnAxisType(column.type),
});

/** First non-numeric column, else the first column that is not the value. */
const pickDefaultX = (
    columns: ResultColumn[],
    layout: PivotChartLayout,
): ResultColumn | undefined => {
    const used = new Set(layout.y.map((y) => y.reference));
    return (
        columns.find((column) => !isNumeric(column)) ??
        columns.find((column) => !used.has(column.reference))
    );
};

/** Column-type default for one kind; null when the columns cannot chart it. */
const defaultLayoutFor = (
    kind: ComposerChartKind,
    { columns, rows, node }: ResultShape,
): PivotChartLayout | null => {
    const plan = getComposerVizPlan({ columns, rows, node, vizConfig: null });
    const axes = plan.axes[kind];
    if (axes) return getComposerFieldConfig(axes);
    const y = columns.find(isNumeric);
    if (!y) return null;
    const layout: PivotChartLayout = {
        x: undefined,
        y: [{ reference: y.reference, aggregation: VizAggregationOptions.ANY }],
        groupBy: [],
    };
    if (kind === 'big_number') return layout;
    const x = pickDefaultX(columns, layout);
    return x ? { ...layout, x: xOf(x) } : null;
};

/**
 * The panel's value: the stored viz config when every referenced column is
 * still in the result, else the column-type default as a viz config. The only
 * place a default is invented.
 */
export const getComposerVizPanelValue = ({
    vizConfig,
    ...result
}: ResultShape & {
    vizConfig: AllVizChartConfig | null;
}): AllVizChartConfig => {
    if (vizConfig && composerVizConfigFitsColumns(vizConfig, result.columns))
        return vizConfig;
    const plan = getComposerVizPlan({ ...result, vizConfig: null });
    if (plan.defaultKind === 'table') return tableConfig();
    const axes = plan.axes[plan.defaultKind];
    if (!axes) return tableConfig();
    return buildComposerVizConfig({
        kind: plan.defaultKind,
        fieldConfig: getComposerFieldConfig(axes),
    });
};

export type ComposerVizPanelOptions = {
    kinds: ComposerVizKind[];
    /** Every column, non-numeric first. */
    x: ResultColumn[];
    /** Numeric columns. */
    y: ResultColumn[];
    /** Non-numeric columns not used as x. */
    groupBy: ResultColumn[];
    aggregations: VizAggregationOptions[];
};

export const getComposerVizPanelOptions = (
    value: AllVizChartConfig,
    columns: ResultColumn[],
    rows: RawResultRow[],
): ComposerVizPanelOptions => {
    const xReference = layoutOf(value)?.x?.reference;
    const numeric = columns.filter(isNumeric);
    const other = columns.filter((column) => !isNumeric(column));
    return {
        kinds: getAvailableComposerVizKinds(columns, rows),
        x: [...other, ...numeric],
        y: numeric,
        groupBy: other.filter((column) => column.reference !== xReference),
        aggregations: COMPOSER_VIZ_AGGREGATIONS,
    };
};

/** A value sort always follows the first y. */
const withSortOnFirstY = (layout: PivotChartLayout): PivotChartLayout => {
    const sort = layout.sortBy?.[0];
    const first = layout.y[0];
    if (!sort || !first) {
        const { sortBy: _sortBy, ...rest } = layout;
        return rest;
    }
    return { ...layout, sortBy: [{ ...sort, reference: first.reference }] };
};

const withLayout = (
    kind: ComposerChartKind,
    layout: PivotChartLayout,
): AllVizChartConfig =>
    buildComposerVizConfig({ kind, fieldConfig: withSortOnFirstY(layout) });

const editLayout = (
    value: AllVizChartConfig,
    edit: (layout: PivotChartLayout) => PivotChartLayout,
): AllVizChartConfig => {
    if (value.type === ChartKind.TABLE || !value.fieldConfig) return value;
    return withLayout(chartKindOf(value), edit(value.fieldConfig));
};

/** bar/line keep everything; pie drops the split and extra y; big number keeps only the first y. */
const applyKindRules = (
    kind: ComposerChartKind,
    layout: PivotChartLayout,
    columns: ResultColumn[],
): PivotChartLayout | null => {
    const ensureX = (base: PivotChartLayout): PivotChartLayout | null => {
        if (base.x) return base;
        const x = pickDefaultX(columns, base);
        return x ? { ...base, x: xOf(x) } : null;
    };
    switch (kind) {
        case 'bar':
        case 'line':
            return ensureX({ ...layout, groupBy: layout.groupBy ?? [] });
        case 'pie':
            return ensureX({ ...layout, y: layout.y.slice(0, 1), groupBy: [] });
        case 'big_number':
            return {
                x: undefined,
                y: layout.y.slice(0, 1),
                groupBy: [],
            };
        default:
            return assertUnreachable(kind, 'Unknown composer chart kind');
    }
};

/**
 * Switches the kind. Field config carries over by the kind rules; table drops
 * it, and leaving table restores `remembered` when it still fits, else the
 * column-type default for that kind.
 */
export const switchComposerVizKind = (
    value: AllVizChartConfig,
    kind: ComposerVizKind,
    {
        remembered,
        ...result
    }: ResultShape & { remembered: AllVizChartConfig | null },
): AllVizChartConfig => {
    if (kind === 'table') return tableConfig();
    const source = ((): ComposerChartConfig | null => {
        if (value.type !== ChartKind.TABLE) return value;
        if (
            remembered &&
            remembered.type !== ChartKind.TABLE &&
            composerVizConfigFitsColumns(remembered, result.columns)
        )
            return remembered;
        return null;
    })();
    const layout = source?.fieldConfig ?? defaultLayoutFor(kind, result);
    if (!layout) return tableConfig();
    const next = applyKindRules(kind, layout, result.columns);
    return next ? withLayout(kind, next) : tableConfig();
};

export const setComposerVizX = (
    value: AllVizChartConfig,
    reference: string,
    columns: ResultColumn[],
): AllVizChartConfig => {
    const column = columnsByReference(columns).get(reference);
    if (!column) return value;
    return editLayout(value, (layout) => ({
        ...layout,
        x: xOf(column),
        groupBy: (layout.groupBy ?? []).filter(
            (g) => g.reference !== reference,
        ),
    }));
};

export const setComposerVizY = (
    value: AllVizChartConfig,
    index: number,
    patch: { reference?: string; aggregation?: VizAggregationOptions },
): AllVizChartConfig =>
    editLayout(value, (layout) => ({
        ...layout,
        y: layout.y.map((y, i) => (i === index ? { ...y, ...patch } : y)),
    }));

/** Adds the next numeric column not already charted; no-op when none is left. */
export const addComposerVizY = (
    value: AllVizChartConfig,
    columns: ResultColumn[],
): AllVizChartConfig =>
    editLayout(value, (layout) => {
        const used = new Set(layout.y.map((y) => y.reference));
        const next = columns.find(
            (column) => isNumeric(column) && !used.has(column.reference),
        );
        if (!next) return layout;
        return {
            ...layout,
            y: [
                ...layout.y,
                {
                    reference: next.reference,
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
        };
    });

/** Never drops the last y. */
export const removeComposerVizY = (
    value: AllVizChartConfig,
    index: number,
): AllVizChartConfig =>
    editLayout(value, (layout) =>
        layout.y.length <= 1
            ? layout
            : { ...layout, y: layout.y.filter((_, i) => i !== index) },
    );

export const setComposerVizGroupBy = (
    value: AllVizChartConfig,
    reference: string | null,
): AllVizChartConfig =>
    editLayout(value, (layout) => ({
        ...layout,
        groupBy: reference ? [{ reference }] : [],
    }));

export const getComposerVizSort = (
    value: AllVizChartConfig,
): ComposerVizSort => {
    const layout = layoutOf(value);
    const sort = layout?.sortBy?.[0];
    if (!sort || sort.reference !== layout?.y[0]?.reference) return 'x_order';
    return sort.direction === SortByDirection.DESC ? 'value_desc' : 'value_asc';
};

export const setComposerVizSort = (
    value: AllVizChartConfig,
    sort: ComposerVizSort,
): AllVizChartConfig =>
    editLayout(value, (layout) => {
        const { sortBy: _sortBy, ...rest } = layout;
        const first = layout.y[0];
        if (sort === 'x_order' || !first) return rest;
        return {
            ...rest,
            sortBy: [
                {
                    reference: first.reference,
                    direction:
                        sort === 'value_desc'
                            ? SortByDirection.DESC
                            : SortByDirection.ASC,
                },
            ],
        };
    });

export const getComposerVizKindLabel = (kind: ComposerVizKind): string => {
    switch (kind) {
        case 'table':
            return 'Table';
        case 'bar':
            return 'Bar';
        case 'line':
            return 'Line';
        case 'pie':
            return 'Pie';
        case 'big_number':
            return 'Big value';
        default:
            return assertUnreachable(kind, 'Unknown composer viz kind');
    }
};

const AGGREGATION_PREFIX: Record<VizAggregationOptions, string> = {
    [VizAggregationOptions.ANY]: '',
    [VizAggregationOptions.SUM]: 'sum',
    [VizAggregationOptions.AVERAGE]: 'avg',
    [VizAggregationOptions.MIN]: 'min',
    [VizAggregationOptions.MAX]: 'max',
    [VizAggregationOptions.COUNT]: 'count',
};

/** `x × y by groupBy`, labels over references, aggregation prefixed on y when not ANY, at most two y names. */
export const summarizeComposerVizConfig = (
    value: AllVizChartConfig,
    columns: ResultColumn[],
): string => {
    if (value.type === ChartKind.TABLE) return 'Table';
    const layout = value.fieldConfig;
    if (!layout) return getComposerVizKindLabel(chartKindOf(value));
    const known = columnsByReference(columns);
    const name = (reference: string) =>
        known.get(reference)?.label ?? reference;
    const ys = layout.y.map((y) =>
        [AGGREGATION_PREFIX[y.aggregation], name(y.reference)]
            .filter(Boolean)
            .join(' '),
    );
    const shownYs = ys.slice(0, 2).join(', ');
    const yText = ys.length > 2 ? `${shownYs} +${ys.length - 2}` : shownYs;
    if (value.type === ChartKind.BIG_NUMBER || !layout.x) return yText;
    const groupBy = layout.groupBy?.[0];
    const split =
        value.type === ChartKind.PIE || !groupBy
            ? ''
            : ` by ${name(groupBy.reference)}`;
    return `${name(layout.x.reference)} × ${yText}${split}`;
};

export type ComposerVizColumns = {
    x: ResultColumn | null;
    y: ResultColumn[];
    groupBy: ResultColumn | null;
};

/** Columns a chart draws from; null when one is missing from the result. */
export const resolveComposerVizColumns = (
    layout: PivotChartLayout,
    columns: ResultColumn[],
): ComposerVizColumns | null => {
    const known = columnsByReference(columns);
    const x = layout.x ? (known.get(layout.x.reference) ?? null) : null;
    if (layout.x && !x) return null;
    const y = layout.y.map((item) => known.get(item.reference));
    if (y.some((column) => column === undefined)) return null;
    const groupByReference = layout.groupBy?.[0]?.reference;
    const groupBy = groupByReference
        ? (known.get(groupByReference) ?? null)
        : null;
    if (groupByReference && !groupBy) return null;
    return {
        x,
        y: y.filter((c): c is ResultColumn => c !== undefined),
        groupBy,
    };
};

/** True when the chart needs the pivoted re-run: a series split, a real aggregation, or a value sort. */
export const composerVizNeedsPivot = (layout: PivotChartLayout): boolean =>
    (layout.groupBy?.length ?? 0) > 0 ||
    layout.y.some((y) => y.aggregation !== VizAggregationOptions.ANY) ||
    (layout.sortBy?.length ?? 0) > 0;

const referenceSchema = z.string().min(1);
const metadataSchema = z.object({ version: z.number().int() }).strict();
const layoutSchema = z
    .object({
        x: z
            .object({ reference: referenceSchema, type: z.enum(VizIndexType) })
            .strict()
            .optional(),
        y: z
            .array(
                z
                    .object({
                        reference: referenceSchema,
                        aggregation: z.enum(VizAggregationOptions),
                    })
                    .strict(),
            )
            .min(1),
        groupBy: z
            .array(z.object({ reference: referenceSchema }).strict())
            .optional(),
        sortBy: z
            .array(
                z
                    .object({
                        reference: referenceSchema,
                        direction: z.enum(SortByDirection),
                        nullsFirst: z.boolean().optional(),
                    })
                    .strict(),
            )
            .optional(),
    })
    .strict();
const chartSchema = <T extends ComposerChartConfig['type']>(type: T) =>
    z
        .object({
            type: z.literal(type),
            metadata: metadataSchema,
            fieldConfig: layoutSchema,
            display: z.undefined().optional(),
        })
        .strict();
const tableColumnSchema = z
    .object({
        visible: z.boolean(),
        reference: referenceSchema,
        label: z.string(),
        frozen: z.boolean(),
        order: z.number().optional(),
    })
    .strict();

/** The stored composer viz config: the five kinds, field config only, no display options. */
export const composerVizConfigSchema = z.discriminatedUnion('type', [
    chartSchema(ChartKind.VERTICAL_BAR),
    chartSchema(ChartKind.LINE),
    chartSchema(ChartKind.PIE),
    chartSchema(ChartKind.BIG_NUMBER),
    z
        .object({
            type: z.literal(ChartKind.TABLE),
            metadata: metadataSchema,
            columns: z.record(referenceSchema, tableColumnSchema),
            display: z.undefined().optional(),
        })
        .strict(),
]);

export type ParsedComposerVizConfig =
    | { ok: true; vizConfig: AllVizChartConfig }
    | { ok: false; error: string };

/** Validates an untrusted viz config and normalises it to the stored shape. */
export const parseComposerVizConfig = (
    input: unknown,
): ParsedComposerVizConfig => {
    const parsed = composerVizConfigSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: z.prettifyError(parsed.error) };
    }
    const { data } = parsed;
    if (data.type === ChartKind.TABLE) {
        return {
            ok: true,
            vizConfig: {
                type: ChartKind.TABLE,
                metadata: data.metadata,
                columns: data.columns,
                display: undefined,
            },
        };
    }
    const { fieldConfig } = data;
    const layout: PivotChartLayout = {
        x: fieldConfig.x,
        y: fieldConfig.y,
        groupBy: fieldConfig.groupBy ?? [],
        ...(fieldConfig.sortBy ? { sortBy: fieldConfig.sortBy } : {}),
    };
    return {
        ok: true,
        vizConfig: withLayout(chartKindOfType(data.type), layout),
    };
};
