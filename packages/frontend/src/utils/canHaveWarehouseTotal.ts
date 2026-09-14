import {
    isCustomDimension,
    isDimension,
    isNumericItem,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';

// Warehouse totals and subtotals only re-aggregate metrics and table calcs.
// A numeric dimension is a group key, so it never gets a total.
export const canHaveWarehouseTotal = (
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): boolean =>
    isNumericItem(item) && !isDimension(item) && !isCustomDimension(item);
