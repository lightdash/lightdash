import {
    buildPivotRowTotalKey,
    getSubtotalKey,
    normalizePivotMatchRaw,
    type GroupedPivotRowSubtotals,
    type ResultValue,
} from '@lightdash/common';

/** The grouping cells of a grouped row, keyed by grouping dimension id. */
export type SubtotalGroupingValues = Record<
    string,
    { value: ResultValue } | undefined
>;

/**
 * The subtotal lookup key for the grouping dimensions applied to a row
 * (the first `depth + 1` grouping columns).
 */
export function getSubtotalGroupKey(
    groupingDimensions: string[],
): string | undefined {
    if (!groupingDimensions.length) {
        return undefined;
    }
    return getSubtotalKey(groupingDimensions);
}

// Pass `{}` for pivotedHeaderValues in the non-pivoted path.
// `onError` receives a comparison that threw (the frontend reports it to
// Sentry); the record is then treated as not matching.
export function findMatchingSubtotal(
    records: Record<string, number>[] | undefined,
    groupingValues: SubtotalGroupingValues,
    pivotedHeaderValues: Record<string, ResultValue>,
    onError?: (error: unknown) => void,
): Record<string, number> | undefined {
    return records?.find((sub) => {
        try {
            return (
                Object.keys(groupingValues).every(
                    (key) =>
                        normalizePivotMatchRaw(
                            groupingValues[key]?.value.raw,
                        ) === normalizePivotMatchRaw(sub[key]),
                ) &&
                Object.keys(pivotedHeaderValues).every(
                    (key) =>
                        normalizePivotMatchRaw(
                            pivotedHeaderValues[key]?.raw,
                        ) === normalizePivotMatchRaw(sub[key]),
                )
            );
        } catch (e) {
            onError?.(e);
            return false;
        }
    });
}

export function getSubtotalValueFromGroup(
    subtotal: Record<string, number> | undefined,
    columnId: string,
): number | null | undefined {
    // No matching subtotal record exists (no data for this combination)
    // Return undefined so formatItemValue will show '-'
    if (subtotal === undefined) {
        return undefined;
    }

    const subtotalColumnIds = Object.keys(subtotal);

    // If the subtotal column is not in the subtotalsGroup, return null
    // This is needed to prevent showing '-' when processing a value for the last grouped dimension column which is not taken into account for subtotals
    // This column only exists when we're expanding the last grouped dimension
    if (!subtotalColumnIds.includes(columnId)) {
        return null;
    }

    // Convert null to undefined so formatItemValue shows '-' instead of '∅'
    // SQL returns null when all aggregated values are null (no data)
    return subtotal[columnId] ?? undefined;
}

export function getRowSubtotalValue(
    groupedRowSubtotals: GroupedPivotRowSubtotals | undefined,
    subtotalGroupKey: string,
    groupingValues: SubtotalGroupingValues,
    metricFieldId: string | undefined,
): number | null | undefined {
    if (!groupedRowSubtotals || !metricFieldId) return undefined;

    const subtotalRow =
        groupedRowSubtotals[subtotalGroupKey]?.[
            buildPivotRowTotalKey(
                Object.entries(groupingValues).map(([fieldId, value]) => [
                    fieldId,
                    value?.value.raw,
                ]),
            )
        ];
    if (!subtotalRow) return undefined;

    const total =
        subtotalRow[`${metricFieldId}_any`] ?? subtotalRow[metricFieldId];
    return typeof total === 'number' ? total : null;
}
