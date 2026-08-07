import { type ResultValue } from '@lightdash/common';

type GroupingValues = Record<string, { value: ResultValue } | undefined>;

/**
 * `fieldId -> value` context passed to `openUnderlyingDataModal` /
 * `openDrillDownModal` from a totals cell.
 *
 * Both consumers turn dimension entries into equality filters and ignore
 * non-dimension ones, so the dimension keys present here are exactly the scope
 * of the resulting query:
 * - grand total: no dimensions, so only the chart's own filters apply
 * - subtotal: the group's dimensions, matching leaf-cell drill behaviour
 *
 * The metric's own value is included under its field id — it isn't a filter, but
 * `DrillDownMenuItem` reads it to label "Drill into <value>".
 */
export const getGrandTotalFieldValues = (
    itemId: string,
    totalValue: ResultValue,
): Record<string, ResultValue> => ({ [itemId]: totalValue });

export const getSubtotalFieldValues = (
    groupingValues: GroupingValues,
    itemId: string,
    subtotalValue: ResultValue,
): Record<string, ResultValue> => {
    const dimensionValues = Object.entries(groupingValues).reduce<
        Record<string, ResultValue>
    >((acc, [fieldId, cellValue]) => {
        if (cellValue) acc[fieldId] = cellValue.value;
        return acc;
    }, {});

    return { ...dimensionValues, [itemId]: subtotalValue };
};
