import {
    type PivotData,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

/**
 * Normalised view of a TanStack pivot body cell, mirroring
 * `PivotUnderlyingCell` but keyed by the column's field item id instead of the
 * synthetic column id.
 */
export type PivotRowContextCell = {
    /** `meta.type` — 'indexValue' | 'passthrough' | 'label' | 'rowTotal' | a data column type */
    type: string | undefined;
    /** Item id of `meta.item` when the column renders a field */
    itemId: string | undefined;
    /** The cell's full value (`{ value: ResultValue }`), if any */
    value: ResultRow[string] | undefined;
    /** Pivot-dimension context on data columns (`meta.headerInfo`) */
    headerInfo: Record<string, ResultValue> | undefined;
};

/** Row-level dims: rendered index columns and hidden passthrough columns. */
const isRowDimCell = (cell: PivotRowContextCell) =>
    cell.type === 'indexValue' || cell.type === 'passthrough';

const isDataCell = (cell: PivotRowContextCell | undefined) =>
    cell !== undefined &&
    !isRowDimCell(cell) &&
    cell.type !== 'label' &&
    cell.type !== 'rowTotal';

/**
 * Collects the `fieldId -> value` pairs a templated URL on a pivot body cell
 * can reference. A pivot cell's "row" is the set of row-level dims (rendered,
 * hidden and passthrough), the pivoted dims of the clicked column, the clicked
 * value and, when metrics are columns, the sibling metrics under the same
 * pivot header.
 */
export const collectPivotBodyRowValues = ({
    cells,
    clickedColIndex,
    labelFieldId,
    hiddenIndexCells,
    metricsAsRows,
}: {
    cells: PivotRowContextCell[];
    clickedColIndex: number;
    /** metricsAsRows: the row's metric label field id */
    labelFieldId: string | undefined;
    hiddenIndexCells: PivotData['indexValues'][number];
    metricsAsRows: boolean;
}): Record<string, ResultValue> => {
    const clickedCell = cells[clickedColIndex];
    const clickedHeaderInfo = clickedCell?.headerInfo;
    const clickedValue = clickedCell?.value?.value;
    const values: Record<string, ResultValue> = {};

    cells.forEach((cell) => {
        if (isRowDimCell(cell)) {
            if (cell.itemId && cell.value?.value) {
                values[cell.itemId] = cell.value.value;
            }
        } else if (
            !metricsAsRows &&
            isDataCell(cell) &&
            cell.itemId &&
            cell.value?.value &&
            clickedHeaderInfo &&
            isEqual(cell.headerInfo, clickedHeaderInfo)
        ) {
            values[cell.itemId] = cell.value.value;
        }
    });

    hiddenIndexCells.forEach((cell) => {
        if (cell.type === 'value') {
            values[cell.fieldId] = cell.value;
        }
    });

    if (isDataCell(clickedCell) && clickedHeaderInfo) {
        Object.assign(values, clickedHeaderInfo);
    }

    // metricsAsRows: a data cell's field is the row's metric label, not the
    // pivot dim its column is keyed by.
    const clickedFieldId =
        metricsAsRows && isDataCell(clickedCell)
            ? labelFieldId
            : clickedCell?.itemId;
    if (clickedFieldId && clickedValue) {
        values[clickedFieldId] = clickedValue;
    }

    return values;
};

/**
 * Collects the values a templated URL on a pivot header cell can reference:
 * the cell's own value plus its ancestor header values in the same column.
 * Descendant levels fan out to many values, so they are deliberately absent.
 */
export const collectPivotHeaderRowValues = (
    headerValues: PivotData['headerValues'],
    headerRowIndex: number,
    headerColIndex: number,
): Record<string, ResultValue> =>
    headerValues
        .slice(0, headerRowIndex + 1)
        .reduce<Record<string, ResultValue>>((acc, headerRow) => {
            const cell = headerRow[headerColIndex];
            if (cell?.type === 'value') {
                acc[cell.fieldId] = cell.value;
            }
            return acc;
        }, {});
