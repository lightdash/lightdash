import { type FieldId } from '@lightdash/common';

/**
 * Calculates the column order for the results table.
 *
 * This function:
 * 1. Removes columns that no longer exist (filters out stale columnOrder entries)
 * 2. Adds new columns that aren't in the columnOrder yet
 * 3. When dimensions are provided, inserts new columns after the last dimension
 *    (keeps dimensions grouped together, followed by metrics/calculations)
 * 4. When no dimensions are provided, appends new columns to the end
 *
 * Edge case: When dimensions array is empty, appends to end to avoid Math.max()
 * returning -Infinity which would cause incorrect splice behavior.
 *
 * @param columnOrder - Current column order from table config
 * @param fieldIds - All active field IDs (dimensions + metrics + table calculations)
 * @param dimensions - Optional array of dimension IDs to group new columns after
 * @returns Updated column order with removed stale columns and added new ones
 */
export const calcColumnOrder = (
    columnOrder: FieldId[],
    fieldIds: FieldId[],
    dimensions?: FieldId[],
): FieldId[] => {
    const cleanColumnOrder = columnOrder.filter((column) =>
        fieldIds.includes(column),
    );
    const missingColumns = fieldIds.filter(
        (fieldId) => !cleanColumnOrder.includes(fieldId),
    );

    if (dimensions !== undefined) {
        // Handle empty dimensions array - append to end like the else branch
        // Math.max() returns -Infinity for empty array, causing incorrect splice behavior
        if (dimensions.length === 0) {
            return [...cleanColumnOrder, ...missingColumns];
        }

        const positionDimensionColumn = Math.max(
            ...dimensions.map((d) => cleanColumnOrder.indexOf(d)),
        );
        cleanColumnOrder.splice(
            positionDimensionColumn + 1,
            0,
            ...missingColumns,
        );
        return cleanColumnOrder;
    } else {
        return [...cleanColumnOrder, ...missingColumns];
    }
};
