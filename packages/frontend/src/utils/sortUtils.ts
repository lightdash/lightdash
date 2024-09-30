import {
    assertUnreachable,
    DimensionType,
    getItemType,
    isDimension,
    isField,
    isMetric,
    MetricType,
    TableCalculationType,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    IconSortAscendingLetters,
    IconSortAscendingNumbers,
    IconSortDescendingLetters,
    IconSortDescendingNumbers,
} from '@tabler/icons-react';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const getSortDirectionOrder = (
    item: Field | TableCalculation | CustomDimension,
) => {
    if (!isField(item)) {
        return [SortDirection.ASC, SortDirection.DESC];
    }
    switch (item.type) {
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return [SortDirection.DESC, SortDirection.ASC];
        default:
            return [SortDirection.ASC, SortDirection.DESC];
    }
};

enum NumericSortLabels {
    ASC = '1-9',
    DESC = '9-1',
}

enum StringSortLabels {
    ASC = 'A-Z',
    DESC = 'Z-A',
}

enum DateSortLabels {
    ASC = 'Old-New',
    DESC = 'New-Old',
}

enum BooleanSortLabels {
    ASC = 'False-True',
    DESC = 'True-False',
}

export const getSortLabel = (
    item: Field | TableCalculation | CustomDimension,
    direction: SortDirection,
) => {
    const type = getItemType(item);
    switch (type) {
        case DimensionType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.NUMBER:
        case TableCalculationType.NUMBER:
            return direction === SortDirection.ASC
                ? NumericSortLabels.ASC
                : NumericSortLabels.DESC;
        case DimensionType.STRING:
        case MetricType.STRING:
        case TableCalculationType.STRING:
            return direction === SortDirection.ASC
                ? StringSortLabels.ASC
                : StringSortLabels.DESC;
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case TableCalculationType.TIMESTAMP:
        case TableCalculationType.DATE:
            return direction === SortDirection.ASC
                ? DateSortLabels.ASC
                : DateSortLabels.DESC;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
        case TableCalculationType.BOOLEAN:
            return direction === SortDirection.ASC
                ? BooleanSortLabels.ASC
                : BooleanSortLabels.DESC;
        default:
            return assertUnreachable(
                type,
                'Unexpected type when getting sort label',
            );
    }
};

export const getSortIcon = (
    item: Field | TableCalculation | CustomDimension,
    descending: boolean,
) => {
    if (!isField(item)) {
        return descending
            ? IconSortDescendingLetters
            : IconSortAscendingLetters;
    }

    if (isDimension(item) || isMetric(item)) {
        switch (item.type) {
            case DimensionType.STRING:
            case MetricType.STRING:
            case DimensionType.BOOLEAN:
            case MetricType.BOOLEAN:
                return descending
                    ? IconSortDescendingLetters
                    : IconSortAscendingLetters;
            default:
                // Numbers, dates and times
                return descending
                    ? IconSortDescendingNumbers
                    : IconSortAscendingNumbers;
        }
    }
    return descending ? IconSortDescendingLetters : IconSortAscendingLetters;
};
