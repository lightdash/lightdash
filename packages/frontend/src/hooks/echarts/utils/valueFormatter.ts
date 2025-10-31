import {
    formatItemValue,
    type ItemsMap,
    type PivotValuesColumn,
} from '@lightdash/common';

export const getFormattedValue = (
    value: any,
    key: string,
    itemsMap: ItemsMap,
    convertToUTC: boolean = true,
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
): string => {
    const pivotValuesColumn = pivotValuesColumnsMap?.[key];
    const item = itemsMap[pivotValuesColumn?.referenceField ?? key];
    return formatItemValue(item, value, convertToUTC);
};

export const valueFormatter =
    (
        yFieldId: string,
        itemsMap: ItemsMap,
        pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
    ) =>
    (rawValue: any) => {
        return getFormattedValue(
            rawValue,
            yFieldId,
            itemsMap,
            undefined,
            pivotValuesColumnsMap,
        );
    };
