import { type AnyType } from '../../types/any';
import { type ItemsMap } from '../../types/field';
import { formatItemValue } from '../../utils/formatting';
import { type PivotValuesColumn } from '../types';

export const getFormattedValue = (
    value: AnyType,
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
    (rawValue: AnyType) =>
        getFormattedValue(
            rawValue,
            yFieldId,
            itemsMap,
            undefined,
            pivotValuesColumnsMap,
        );
