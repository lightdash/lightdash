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
export type ComposerVizKind = AiAgentChartTypeOption;

export type ComposerVizPlan = {
    /** Kinds the result's columns support; always includes 'table'. */
    availableKinds: ComposerVizKind[];
    defaultKind: ComposerVizKind;
    /** x axis column, null when no chart kind is available. */
    x: ResultColumn | null;
    /** y axis column, null when no chart kind is available. */
    y: ResultColumn | null;
};

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
): { x: ResultColumn | undefined; y: ResultColumn | undefined } | null => {
    if (node?.sourceType !== QuerySourceType.SEMANTIC_LAYER) return null;
    const byReference = new Map(
        columns.map((column) => [column.reference, column]),
    );
    const x = node.dimensions
        .map((fieldId) => byReference.get(fieldId))
        .find((column) => column !== undefined && !isNumeric(column));
    const y = node.metrics
        .map((fieldId) => byReference.get(fieldId))
        .find((column) => column !== undefined && isNumeric(column));
    if (!x && !y) return null;
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
    const tableOnly: ComposerVizPlan = {
        availableKinds: ['table'],
        defaultKind: 'table',
        x: null,
        y: null,
    };

    const semantic = pickSemanticAxes(columns, node);
    const x = semantic?.x ?? pickX(columns);
    const y = semantic?.y ?? pickY(columns, x);
    if (!x || !y) return tableOnly;

    const availableKinds: ComposerVizKind[] = ['table', 'bar', 'line'];
    const defaultKind = ((): ComposerVizKind => {
        if (hasDuplicateValues(rows, x.reference)) return 'table';
        return isTemporal(x) ? 'line' : 'bar';
    })();

    return { availableKinds, defaultKind, x, y };
};

/** Chart data straight from the fetched rows: x as the index, y as the value. No aggregation, no server call. */
export const buildComposerChartData = ({
    rows,
    x,
    y,
}: {
    rows: RawResultRow[];
    x: ResultColumn;
    y: ResultColumn;
}): { data: PivotChartData; layout: PivotChartLayout } => {
    const indexType = getColumnAxisType(x.type);
    return {
        data: {
            queryUuid: undefined,
            fileUrl: undefined,
            results: rows.map((row) => ({
                [x.reference]: row[x.reference],
                [y.reference]: row[y.reference],
            })),
            indexColumn: { reference: x.reference, type: indexType },
            valuesColumns: [
                {
                    referenceField: y.reference,
                    pivotColumnName: y.reference,
                    aggregation: VizAggregationOptions.ANY,
                    pivotValues: [],
                },
            ],
            columns: [
                { reference: x.reference, type: x.type },
                { reference: y.reference, type: y.type },
            ],
            columnCount: 2,
        },
        layout: {
            x: { reference: x.reference, type: indexType },
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
