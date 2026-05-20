/**
 * Returns true when a field is a non-leaf row-index dim and subtotals are on
 * — i.e., hiding it would corrupt subtotal aggregation. Used by the pivot UI
 * to disable the hide affordance for those fields.
 *
 * `rowDims` is the ordered list of row-index dimensions (dims selected in
 * the query that aren't in the pivot columns). The leaf row dim (last entry)
 * never groups subtotals, so it's always safe to hide.
 */
export const isFieldSubtotalGroupingLevel = (
    fieldId: string,
    rowDims: string[],
    showSubtotals: boolean,
): boolean => {
    if (!showSubtotals) return false;
    const index = rowDims.indexOf(fieldId);
    return index !== -1 && index < rowDims.length - 1;
};

/**
 * Derive row-index dimensions from the metric query + pivot config.
 * Row dims = all selected dims that aren't pivoted as column headers.
 */
export const getRowDims = (
    dimensions: string[],
    pivotedDims: string[] | undefined,
): string[] => {
    const pivotSet = new Set(pivotedDims ?? []);
    return dimensions.filter((d) => !pivotSet.has(d));
};
