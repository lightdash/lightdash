import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type RawResultRow, type ResultColumn } from '../../types/results';
import {
    getColumnAxisType,
    VizAggregationOptions,
    type PivotChartData,
    type PivotChartLayout,
} from '../../visualizations/types';
import { type AiAgentChartTypeOption } from './chartConfig/web/types';

/** How a displayed node result renders: the table or a chart kind. */
export type ComposerVizKind = AiAgentChartTypeOption | 'big_number';

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
    'horizontal',
    'line',
    'scatter',
    'pie',
    'funnel',
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

/** Kinds a node result can render as and the one it opens with, from column types and row shape alone. */
export const getComposerVizPlan = ({
    columns,
    rows,
    node,
}: {
    columns: ResultColumn[];
    rows: RawResultRow[];
    node: SourceQuery | null;
}): ComposerVizPlan => {
    const semantic = pickSemanticAxes(columns, node);
    const x = semantic?.x ?? pickX(columns);
    const y = semantic?.y ?? pickY(columns, x);
    const numerics = columns.filter(isNumeric);
    const axes: ComposerVizPlan['axes'] = {};

    if (x && y) {
        axes.bar = { x, y };
        axes.horizontal = { x, y };
        axes.line = { x, y };
    }
    if (numerics.length >= 2) {
        axes.scatter = { x: numerics[0], y: numerics[1] };
    }
    const category =
        x?.type === DimensionType.STRING
            ? x
            : firstOfType(columns, DimensionType.STRING);
    // Pie and funnel slice the string column; y stays unless it is that column.
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
        axes.funnel = { x: category, y: categoryValue };
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
