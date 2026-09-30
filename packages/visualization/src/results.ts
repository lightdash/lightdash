import {
    formatItemValue,
    type ItemsMap,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';

/**
 * Turns raw rows (one plain value per field id, as the query API's raw
 * results, the query SDK and CSV exports produce them) into the rows the
 * chart builders read, formatting each value the way the field defines.
 *
 * The visualization engine never runs a query: any source that can produce
 * rows keyed by field id, plus the fields' definitions, can feed it.
 */
export const toResultRows = (
    rows: RawResultRow[],
    itemsMap: ItemsMap,
    /** Formatted values by field id when the source already formatted them. */
    formatted?: (row: RawResultRow, fieldId: string) => string | undefined,
): ResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([fieldId, raw]) => [
                fieldId,
                {
                    value: {
                        raw,
                        formatted:
                            formatted?.(row, fieldId) ??
                            formatItemValue(itemsMap[fieldId], raw),
                    },
                },
            ]),
        ),
    );
