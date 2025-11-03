import { type AnyType } from '../../types/any';
import { type ItemsMap } from '../../types/field';
import { type ParametersValuesMap } from '../../types/parameters';
import { formatItemValue } from '../../utils/formatting';
import { type PivotValuesColumn } from '../types';

export const getFormattedValue = (
    value: AnyType,
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
    (rawValue: AnyType) =>
        getFormattedValue(
            rawValue,
            yFieldId,
            itemsMap,
            undefined,
            pivotValuesColumnsMap,
            parameters,
        );
