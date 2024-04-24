import {
    assertUnreachable,
    DimensionType,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
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
    if (isTableCalculation(item)) {
        const type = item.type;
        if (type === undefined)
            return direction === SortDirection.ASC
                ? NumericSortLabels.ASC
                : NumericSortLabels.DESC;
        switch (type) {
            case TableCalculationType.NUMBER:
                return direction === SortDirection.ASC
                    ? NumericSortLabels.ASC
                    : NumericSortLabels.DESC;
            case TableCalculationType.STRING:
                return direction === SortDirection.ASC
                    ? StringSortLabels.ASC
                    : StringSortLabels.DESC;
            case TableCalculationType.TIMESTAMP:
            case TableCalculationType.DATE:
                return direction === SortDirection.ASC
                    ? DateSortLabels.ASC
                    : DateSortLabels.DESC;
            case TableCalculationType.BOOLEAN:
                return direction === SortDirection.ASC
                    ? BooleanSortLabels.ASC
                    : BooleanSortLabels.DESC;
            default:
                return assertUnreachable(
                    type,
                    'Unexpected dimension type when getting sort label',
                );
        }
    }

    if (!isField(item)) {
        return direction === SortDirection.ASC
            ? NumericSortLabels.ASC
            : NumericSortLabels.DESC;
    }

    if (isDimension(item)) {
        const type = item.type;
        switch (type) {
            case DimensionType.NUMBER:
                return direction === SortDirection.ASC
                    ? NumericSortLabels.ASC
                    : NumericSortLabels.DESC;
            case DimensionType.STRING:
                return direction === SortDirection.ASC
                    ? StringSortLabels.ASC
                    : StringSortLabels.DESC;
            case DimensionType.TIMESTAMP:
            case DimensionType.DATE:
                return direction === SortDirection.ASC
                    ? DateSortLabels.ASC
                    : DateSortLabels.DESC;
            case DimensionType.BOOLEAN:
                return direction === SortDirection.ASC
                    ? BooleanSortLabels.ASC
                    : BooleanSortLabels.DESC;
            default:
                return assertUnreachable(
                    type,
                    'Unexpected dimension type when getting sort label',
                );
        }
    } else if (isMetric(item)) {
        const type = item.type;
        switch (type) {
            case MetricType.PERCENTILE:
            case MetricType.MEDIAN:
            case MetricType.AVERAGE:
            case MetricType.COUNT:
            case MetricType.COUNT_DISTINCT:
            case MetricType.SUM:
            case MetricType.MIN:
            case MetricType.MAX:
            case MetricType.NUMBER:
                return direction === SortDirection.ASC
                    ? NumericSortLabels.ASC
                    : NumericSortLabels.DESC;
            case MetricType.STRING:
                return direction === SortDirection.ASC
                    ? StringSortLabels.ASC
                    : StringSortLabels.DESC;
            case MetricType.DATE:
            case MetricType.TIMESTAMP:
                return direction === SortDirection.ASC
                    ? DateSortLabels.ASC
                    : DateSortLabels.DESC;
            case MetricType.BOOLEAN:
                return direction === SortDirection.ASC
                    ? BooleanSortLabels.ASC
                    : BooleanSortLabels.DESC;
            default:
                return assertUnreachable(
                    type,
                    'Unexpected metric type when getting sort label',
                );
        }
    } else {
        throw new Error('Field is not a Dimension or Metric');
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
