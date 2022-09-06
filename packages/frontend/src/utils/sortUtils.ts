import {
    DimensionType,
    Field,
    isDimension,
    isMetric,
    MetricType,
} from '@lightdash/common';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const getSortDirectionOrder = (field: Field) => {
    switch (field.type) {
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
    ASC = 'No-Yes',
    DESC = 'Yes-No',
}

const assertUnreachable = (_x: never): never => {
    throw new Error("Didn't expect to get here");
};

export const getSortLabel = (field: Field, direction: SortDirection) => {
    if (isDimension(field)) {
        switch (field.type) {
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
                return assertUnreachable(field.type);
        }
    } else if (isMetric(field)) {
        switch (field.type) {
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
                return direction === SortDirection.ASC
                    ? DateSortLabels.ASC
                    : DateSortLabels.DESC;
            case MetricType.BOOLEAN:
                return direction === SortDirection.ASC
                    ? BooleanSortLabels.ASC
                    : BooleanSortLabels.DESC;
            default:
                return assertUnreachable(field.type);
        }
    } else {
        return direction === SortDirection.ASC ? 'Low-High' : 'Last-First';
    }
};
