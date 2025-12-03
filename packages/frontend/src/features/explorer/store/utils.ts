import { type FieldId, type ResultColumns } from '@lightdash/common';

/**
 * Relationship between a Period-over-Period field and its base field
 */
export type PopFieldRelationship = {
    baseFieldId: string;
    popFieldId: string;
};

/**
 * Result of computing column order with PoP fields
 */
export type ColumnOrderWithPoP = {
    completeColumnOrder: string[];
    popRelationships: Map<string, PopFieldRelationship>;
};

/**
 * Computes the complete column order including period-over-period (PoP) fields
 * using the popMetadata from ResultColumns (provided by the API).
 *
 * This is a pure function that can be used in both Redux selectors and hooks.
 * It uses backend-provided metadata instead of string matching, making it
 * robust against naming convention changes.
 *
 * @param baseColumnOrder - The original column order without PoP columns
 * @param resultsColumns - The ResultColumns from the API response (contains popMetadata)
 * @returns Object containing:
 *   - completeColumnOrder: The full ordered list of column IDs including PoP fields
 *   - popRelationships: Map of PoP field ID to its relationship with the base field
 */
export const computeColumnOrderWithPoP = (
    baseColumnOrder: string[],
    resultsColumns: ResultColumns | undefined,
): ColumnOrderWithPoP => {
    const popRelationships = new Map<string, PopFieldRelationship>();

    // If no results columns, return base order
    if (!resultsColumns) {
        return {
            completeColumnOrder: baseColumnOrder,
            popRelationships,
        };
    }

    // Build map of PoP columns using popMetadata from API
    // Key: baseFieldId, Value: popFieldId
    const popFieldsByBase = new Map<string, string>();
    const popFieldIds = new Set<string>();

    for (const [fieldId, column] of Object.entries(resultsColumns)) {
        if (column.popMetadata) {
            const { baseFieldId } = column.popMetadata;
            popFieldsByBase.set(baseFieldId, fieldId);
            popFieldIds.add(fieldId);
            popRelationships.set(fieldId, {
                baseFieldId,
                popFieldId: fieldId,
            });
        }
    }

    // If no PoP columns found, return base order
    if (popFieldsByBase.size === 0) {
        return {
            completeColumnOrder: baseColumnOrder,
            popRelationships,
        };
    }

    // Filter out any PoP fields that may have gotten into baseColumnOrder
    // This is a defensive check to prevent duplication if PoP fields were incorrectly included
    const cleanBaseOrder = baseColumnOrder.filter(
        (field) => !popFieldIds.has(field),
    );

    // Build complete order: insert each PoP field right after its base field
    const completeOrder: string[] = [];

    for (const baseFieldId of cleanBaseOrder) {
        completeOrder.push(baseFieldId);

        // If this base field has a PoP sibling, insert it right after
        const popFieldId = popFieldsByBase.get(baseFieldId);
        if (popFieldId) {
            completeOrder.push(popFieldId);
        }
    }

    return {
        completeColumnOrder: completeOrder,
        popRelationships,
    };
};

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
