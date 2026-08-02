import {
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type ItemsMap,
} from '@lightdash/common';

export const isPivotRowValue = (item: ItemsMap[string] | undefined): boolean =>
    item !== undefined && (isMetric(item) || isTableCalculation(item));

export const resolvePivotRowFieldIds = ({
    selectedItemIds,
    itemsMap,
    pivotDimensions,
    columnOrder,
    pivotRows,
}: {
    selectedItemIds: string[] | undefined;
    itemsMap: ItemsMap | undefined;
    pivotDimensions: string[] | undefined;
    columnOrder: string[];
    pivotRows: string[] | undefined;
}): string[] => {
    if (!selectedItemIds || !itemsMap) return [];

    const selectedItemIdSet = new Set(selectedItemIds);
    const pivotDimensionSet = new Set(pivotDimensions ?? []);
    const defaultRowDimensions = columnOrder.filter((fieldId) => {
        const item = itemsMap[fieldId];
        return (
            selectedItemIdSet.has(fieldId) &&
            !pivotDimensionSet.has(fieldId) &&
            item !== undefined &&
            (isDimension(item) || isCustomDimension(item))
        );
    });

    if (pivotRows === undefined) return defaultRowDimensions;

    const configuredFields = pivotRows.filter((fieldId) => {
        const item = itemsMap[fieldId];
        return (
            selectedItemIdSet.has(fieldId) &&
            !pivotDimensionSet.has(fieldId) &&
            item !== undefined &&
            (isDimension(item) ||
                isCustomDimension(item) ||
                (pivotDimensionSet.size > 0 && isPivotRowValue(item)))
        );
    });

    return [
        ...configuredFields,
        ...defaultRowDimensions.filter(
            (fieldId) => !configuredFields.includes(fieldId),
        ),
    ];
};

export const shouldDisableMetricsAsRows = ({
    metricsAsRows,
    selectedItemIds,
    rowFieldIds,
    itemsMap,
}: {
    metricsAsRows: boolean;
    selectedItemIds: string[] | undefined;
    rowFieldIds: string[];
    itemsMap: ItemsMap | undefined;
}): boolean => {
    if (!metricsAsRows || !selectedItemIds || !itemsMap) return false;

    const rowFieldIdSet = new Set(rowFieldIds);
    return !selectedItemIds.some(
        (fieldId) =>
            !rowFieldIdSet.has(fieldId) && isPivotRowValue(itemsMap[fieldId]),
    );
};
