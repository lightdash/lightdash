import {
    type PivotData,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';

/**
 * Normalised view of a TanStack pivot cell — the subset of `cell` /
 * `cell.column.columnDef.meta` that the value-collection logic reads. Mapping
 * the live table cells to this shape lets the logic below be unit-tested
 * without mounting a TanStack Table + React tree (PROD-7841).
 */
export type PivotUnderlyingCell = {
    /** `meta.type` — e.g. 'indexValue' | 'label' | a data column type */
    type: string | undefined;
    /** `columnDef.id` */
    id: string | undefined;
    /** The cell's full value (`{ value: ResultValue }`), if any */
    value: ResultRow[string] | undefined;
    /** Pivot-dimension context on data columns (`meta.headerInfo`) */
    headerInfo: Record<string, ResultValue> | undefined;
};

/**
 * Builds the `fieldId -> ResultValue` map that scopes "View underlying data" /
 * "Drill into" for a clicked pivot cell. Pure value-collection logic extracted
 * from PivotTable's `getUnderlyingFieldValues` callback so it is testable in
 * isolation.
 *
 * `hiddenIndexCells` carries row-index dims hidden via `hiddenDimensionFieldIds`
 * — they are absent from the rendered `cells`, so without merging them the
 * drill scope silently widens (PROD-7841).
 */
export const collectPivotUnderlyingValues = ({
    cells,
    clickedColIndex,
    clickedItemId,
    clickedValue,
    labelFieldId,
    hiddenIndexCells,
}: {
    cells: PivotUnderlyingCell[];
    clickedColIndex: number;
    clickedItemId: string | undefined;
    clickedValue: ResultValue | undefined;
    labelFieldId: string | undefined;
    hiddenIndexCells: PivotData['indexValues'][number];
}): Record<string, ResultValue> => {
    let underlyingValues: Record<string, ResultValue> =
        clickedItemId && clickedValue ? { [clickedItemId]: clickedValue } : {};

    cells.forEach((cell, cellIndex) => {
        if (cell.type === 'indexValue') {
            if (cell.id && cell.value) {
                underlyingValues[cell.id] = cell.value.value;
            }
        } else if (cell.type === 'label') {
            // metricsAsRows: the clicked metric value belongs to the row's
            // metric label dimension.
            if (labelFieldId && clickedValue) {
                underlyingValues[labelFieldId] = clickedValue;
            }
        } else if (clickedColIndex === cellIndex && cell.headerInfo) {
            underlyingValues = { ...underlyingValues, ...cell.headerInfo };
        }
    });

    // Hidden row-index dims are not rendered as cells, so merge their per-row
    // values directly to keep the drill scope precise (PROD-7841).
    hiddenIndexCells.forEach((cell) => {
        if (cell.type === 'value') {
            underlyingValues[cell.fieldId] = cell.value;
        }
    });

    return underlyingValues;
};
