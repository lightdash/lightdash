import {
    formatItemValue,
    type ItemsMap,
    type ParametersValuesMap,
    type PivotValuesColumn,
} from '@lightdash/common';

export const getFormattedValue = (
    value: any,
    key: string,
    itemsMap: ItemsMap,
    convertToUTC: boolean = true,
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
    parameters?: ParametersValuesMap,
): string => {
    const pivotValuesColumn = pivotValuesColumnsMap?.[key];
    const item = itemsMap[pivotValuesColumn?.referenceField ?? key];
    return formatItemValue(item, value, convertToUTC, parameters);
};

export const valueFormatter =
    (
        yFieldId: string,
        itemsMap: ItemsMap,
        pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
        parameters?: ParametersValuesMap,
    ) =>
    (rawValue: any) => {
        return getFormattedValue(
            rawValue,
            yFieldId,
            itemsMap,
            undefined,
            pivotValuesColumnsMap,
            parameters,
        );
    };
