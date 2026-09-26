import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import { ChartKind } from '../../types/savedCharts';
import assertUnreachable from '../../utils/assertUnreachable';
import {
    getColumnAxisType,
    VizAggregationOptions,
    type AllVizChartConfig,
    type PivotChartData,
    type PivotChartLayout,
} from '../../visualizations/types';

/** How a displayed node result renders: the table or a chart kind. */
export type ComposerVizKind = 'table' | 'bar' | 'line' | 'pie' | 'big_number';

export type ComposerChartKind = Exclude<ComposerVizKind, 'table'>;

/** A bar/line series split: one series per groupBy value, y aggregated per x and series. */
export type ComposerSeriesSplit = {
    groupBy: ResultColumn;
    aggregation: VizAggregationOptions;
};

/** Columns a chart kind draws from; x is null for a big number. */
export type ComposerVizAxes = {
    x: ResultColumn | null;
    y: ResultColumn;
    seriesSplit: ComposerSeriesSplit | null;
};

export type ComposerVizPlan = {
    /** Kinds the result's columns support, in switcher order; always includes 'table'. */
    availableKinds: ComposerVizKind[];
    defaultKind: ComposerVizKind;
    /** Axes per available chart kind. */
    axes: Partial<Record<ComposerChartKind, ComposerVizAxes>>;
};

const KIND_ORDER: ComposerVizKind[] = [
    'table',
    'bar',
    'line',
    'pie',
    'big_number',
];

export const isComposerNumericColumn = (column: ResultColumn) =>
    column.type === DimensionType.NUMBER;
const isNumeric = isComposerNumericColumn;
const isTemporal = (column: ResultColumn) =>
    column.type === DimensionType.DATE ||
    column.type === DimensionType.TIMESTAMP;

const firstOfType = (columns: ResultColumn[], type: DimensionType) =>
    columns.find((column) => column.type === type);

/** Mirrors the SQL runner default: first date/timestamp, else string, else boolean. */
const pickX = (columns: ResultColumn[]): ResultColumn | undefined =>
    columns.find(isTemporal) ??
    firstOfType(columns, DimensionType.STRING) ??
    firstOfType(columns, DimensionType.BOOLEAN);

const pickY = (
    columns: ResultColumn[],
    x: ResultColumn | undefined,
): ResultColumn | undefined =>
    columns.find(
        (column) => isNumeric(column) && column.reference !== x?.reference,
    );

/** Semantic-layer nodes declare their axes: first dimension on x, first metric on y. */
const pickSemanticAxes = (
    columns: ResultColumn[],
    node: SourceQuery | null,
): { x: ResultColumn | undefined; y: ResultColumn | undefined } | undefined => {
    if (node?.sourceType !== QuerySourceType.SEMANTIC_LAYER) return undefined;
    const byReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const x = node.dimensions
        .map((fieldId) => byReference.get(fieldId))
        .find((column) => column !== undefined && !isNumeric(column));
    const y = node.metrics
        .map((fieldId) => byReference.get(fieldId))
        .find((column) => column !== undefined && isNumeric(column));
    if (!x && !y) return undefined;
    return { x: x ?? pickX(columns), y: y ?? pickY(columns, x) };
};

const hasDuplicateValues = (rows: RawResultRow[], reference: string) => {
    const seen = new Set<unknown>();
    return rows.some((row) => {
        const value = row[reference];
        if (seen.has(value)) return true;
        seen.add(value);
        return false;
    });
};

const getColumnTypeVizPlan = (
    columns: ResultColumn[],
    rows: RawResultRow[],
    node: SourceQuery | null,
): ComposerVizPlan => {
    const semantic = pickSemanticAxes(columns, node);
    const x = semantic?.x ?? pickX(columns);
    const y = semantic?.y ?? pickY(columns, x);
    const numerics = columns.filter(isNumeric);
    const axes: ComposerVizPlan['axes'] = {};

    if (x && y) {
        axes.bar = { x, y, seriesSplit: null };
        axes.line = { x, y, seriesSplit: null };
    }
    const category =
        x?.type === DimensionType.STRING
            ? x
            : firstOfType(columns, DimensionType.STRING);
    // Pie slices the string column; y stays unless it is that column.
    const categoryValue = ((): ResultColumn | undefined => {
        if (!category) return undefined;
        if (y && y.reference !== category.reference) return y;
        return pickY(columns, category);
    })();
    if (
        category &&
        categoryValue &&
        !hasDuplicateValues(rows, category.reference)
    ) {
        axes.pie = { x: category, y: categoryValue, seriesSplit: null };
    }
    if (rows.length === 1 && numerics.length >= 1) {
        axes.big_number = { x: null, y: y ?? numerics[0], seriesSplit: null };
    }

    const availableKinds = KIND_ORDER.filter(
        (kind) => kind === 'table' || axes[kind] !== undefined,
    );
    const defaultKind = ((): ComposerVizKind => {
        if (axes.big_number) return 'big_number';
        if (!x || !y || hasDuplicateValues(rows, x.reference)) return 'table';
        return isTemporal(x) ? 'line' : 'bar';
    })();

    return { availableKinds, defaultKind, axes };
};

/** The chart kind of a chart viz config; only its type is read. */
export const getComposerChartKind = ({
    type,
}: {
    type: Exclude<AllVizChartConfig, { type: ChartKind.TABLE }>['type'];
}): ComposerChartKind => {
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
            return assertUnreachable(type, 'Unknown viz config type');
    }
};

export const getComposerVizKind = (
    vizConfig: AllVizChartConfig,
): ComposerVizKind =>
    vizConfig.type === ChartKind.TABLE
        ? 'table'
        : getComposerChartKind(vizConfig);

/** Stored axes drive every kind that can use them; the column-type plan fills the rest. Null when the viz config no longer fits the columns. */
const seedFromVizConfig = (
    plan: ComposerVizPlan,
    vizConfig: AllVizChartConfig,
    columns: ResultColumn[],
    rows: RawResultRow[],
): ComposerVizPlan | null => {
    const byReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    if (vizConfig.type === ChartKind.TABLE) {
        const known = Object.keys(vizConfig.columns).every((reference) =>
            byReference.has(reference),
        );
        return known ? { ...plan, defaultKind: 'table' } : null;
    }
    const layout = vizConfig.fieldConfig;
    const yReference = layout?.y[0]?.reference;
    const y =
        yReference === undefined ? undefined : byReference.get(yReference);
    if (!y || !isNumeric(y)) return null;
    const xReference = layout?.x?.reference;
    const x =
        xReference === undefined ? null : (byReference.get(xReference) ?? null);
    if (xReference !== undefined && (!x || x.reference === y.reference))
        return null;
    // Only bar/line split series; a split's duplicate x values are expected.
    const isCartesian =
        vizConfig.type === ChartKind.VERTICAL_BAR ||
        vizConfig.type === ChartKind.LINE;
    const groupByReference = isCartesian
        ? layout?.groupBy?.[0]?.reference
        : undefined;
    const groupBy =
        groupByReference === undefined
            ? null
            : (byReference.get(groupByReference) ?? null);
    if (
        groupByReference !== undefined &&
        (!groupBy ||
            groupBy.reference === x?.reference ||
            groupBy.reference === y.reference)
    )
        return null;
    const seriesSplit =
        groupBy && layout
            ? { groupBy, aggregation: layout.y[0].aggregation }
            : null;

    const axes: ComposerVizPlan['axes'] = { ...plan.axes };
    if (x) {
        axes.bar = { x, y, seriesSplit };
        axes.line = { x, y, seriesSplit };
        if (
            x.type === DimensionType.STRING &&
            !hasDuplicateValues(rows, x.reference)
        ) {
            axes.pie = { x, y, seriesSplit: null };
        }
    }
    if (rows.length === 1) axes.big_number = { x: null, y, seriesSplit: null };

    const defaultKind = getComposerChartKind(vizConfig);
    if (!axes[defaultKind]) return null;
    return {
        availableKinds: KIND_ORDER.filter(
            (kind) => kind === 'table' || axes[kind] !== undefined,
        ),
        defaultKind,
        axes,
    };
};

/**
 * Kinds a node result can render as and the one it opens with: seeded from
 * the stored viz config when it still fits, else from column types and row shape.
 */
export const getComposerVizPlan = ({
    columns,
    rows,
    node,
    vizConfig,
}: {
    columns: ResultColumn[];
    rows: RawResultRow[];
    node: SourceQuery | null;
    vizConfig: AllVizChartConfig | null;
}): ComposerVizPlan => {
    const plan = getColumnTypeVizPlan(columns, rows, node);
    if (!vizConfig) return plan;
    return seedFromVizConfig(plan, vizConfig, columns, rows) ?? plan;
};

/** Field config for axes: x typed by its column; y as-is (node results are already aggregated) unless series split. */
export const getComposerFieldConfig = ({
    x,
    y,
    seriesSplit,
}: ComposerVizAxes): PivotChartLayout => ({
    x: x
        ? { reference: x.reference, type: getColumnAxisType(x.type) }
        : undefined,
    y: [
        {
            reference: y.reference,
            aggregation: seriesSplit?.aggregation ?? VizAggregationOptions.ANY,
        },
    ],
    groupBy: seriesSplit ? [{ reference: seriesSplit.groupBy.reference }] : [],
});

/** Field config for the pivoted re-run of a series split; null without one. */
export const getComposerSeriesSplitLayout = (
    axes: ComposerVizAxes,
): PivotChartLayout | null =>
    axes.x && axes.seriesSplit ? getComposerFieldConfig(axes) : null;

export const buildComposerVizConfig = ({
    kind,
    fieldConfig,
}: {
    kind: ComposerChartKind;
    fieldConfig: PivotChartLayout;
}): AllVizChartConfig => {
    const metadata = { version: 1 };
    switch (kind) {
        case 'bar':
            return {
                type: ChartKind.VERTICAL_BAR,
                metadata,
                fieldConfig,
                display: undefined,
            };
        case 'line':
            return {
                type: ChartKind.LINE,
                metadata,
                fieldConfig,
                display: undefined,
            };
        case 'pie':
            return {
                type: ChartKind.PIE,
                metadata,
                fieldConfig,
                display: undefined,
            };
        case 'big_number':
            return {
                type: ChartKind.BIG_NUMBER,
                metadata,
                fieldConfig,
                display: undefined,
            };
        default:
            return assertUnreachable(kind, 'Unknown composer chart kind');
    }
};

/** Chart data straight from the fetched rows: x as the index (none for a big number), each y as a value. No aggregation, no server call. */
export const buildComposerChartData = ({
    rows,
    x,
    y,
}: {
    rows: RawResultRow[];
    x: ResultColumn | null;
    y: ResultColumn[];
}): {
    data: PivotChartData;
    layout: PivotChartLayout;
} => {
    const index = x
        ? { reference: x.reference, type: getColumnAxisType(x.type) }
        : undefined;
    return {
        data: {
            queryUuid: undefined,
            fileUrl: undefined,
            results: rows.map((row) =>
                Object.fromEntries(
                    [...(x ? [x] : []), ...y].map((column) => [
                        column.reference,
                        row[column.reference],
                    ]),
                ),
            ),
            indexColumn: index,
            valuesColumns: y.map((column) => ({
                referenceField: column.reference,
                pivotColumnName: column.reference,
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [],
            })),
            columns: [...(x ? [x] : []), ...y].map((column) => ({
                reference: column.reference,
                type: column.type,
            })),
            columnCount: (x ? 1 : 0) + y.length,
        },
        layout: {
            x: index,
            y: y.map((column) => ({
                reference: column.reference,
                aggregation: VizAggregationOptions.ANY,
            })),
            groupBy: [],
        },
    };
};
