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

/** Columns a chart kind draws from; x is null for a big number. */
export type ComposerVizAxes = {
    x: ResultColumn | null;
    y: ResultColumn;
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

const isNumeric = (column: ResultColumn) =>
    column.type === DimensionType.NUMBER;
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
        axes.bar = { x, y };
        axes.line = { x, y };
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
        axes.pie = { x: category, y: categoryValue };
    }
    if (rows.length === 1 && numerics.length >= 1) {
        axes.big_number = { x: null, y: y ?? numerics[0] };
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

export const getComposerVizKind = (
    vizConfig: AllVizChartConfig,
): ComposerVizKind => {
    switch (vizConfig.type) {
        case ChartKind.TABLE:
            return 'table';
        case ChartKind.VERTICAL_BAR:
            return 'bar';
        case ChartKind.LINE:
            return 'line';
        case ChartKind.PIE:
            return 'pie';
        case ChartKind.BIG_NUMBER:
            return 'big_number';
        default:
            return assertUnreachable(vizConfig, 'Unknown viz config type');
    }
};

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

    const axes: ComposerVizPlan['axes'] = { ...plan.axes };
    if (x) {
        axes.bar = { x, y };
        axes.line = { x, y };
        if (
            x.type === DimensionType.STRING &&
            !hasDuplicateValues(rows, x.reference)
        ) {
            axes.pie = { x, y };
        }
    }
    if (rows.length === 1) axes.big_number = { x: null, y };

    const defaultKind = getComposerVizKind(vizConfig);
    if (defaultKind === 'table' || !axes[defaultKind]) return null;
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

/** Chart data straight from the fetched rows: x as the index (none for a big number), y as the value. No aggregation, no server call. */
export const buildComposerChartData = ({
    rows,
    x,
    y,
}: {
    rows: RawResultRow[];
} & ComposerVizAxes): { data: PivotChartData; layout: PivotChartLayout } => {
    const index = x
        ? { reference: x.reference, type: getColumnAxisType(x.type) }
        : undefined;
    return {
        data: {
            queryUuid: undefined,
            fileUrl: undefined,
            results: rows.map((row) => ({
                ...(x ? { [x.reference]: row[x.reference] } : {}),
                [y.reference]: row[y.reference],
            })),
            indexColumn: index,
            valuesColumns: [
                {
                    referenceField: y.reference,
                    pivotColumnName: y.reference,
                    aggregation: VizAggregationOptions.ANY,
                    pivotValues: [],
                },
            ],
            columns: [
                ...(x ? [{ reference: x.reference, type: x.type }] : []),
                { reference: y.reference, type: y.type },
            ],
            columnCount: x ? 2 : 1,
        },
        layout: {
            x: index,
            y: [
                {
                    reference: y.reference,
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupBy: [],
        },
    };
};
