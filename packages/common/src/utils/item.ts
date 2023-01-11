import {
    DimensionType,
    Field,
    fieldId,
    isDimension,
    isField,
    MetricType,
} from '../types/field';
import {
    AdditionalMetric,
    isAdditionalMetric,
    TableCalculation,
} from '../types/metricQuery';

export const isNumericItem = (
    item: Field | AdditionalMetric | TableCalculation | undefined,
): boolean => {
    if (!item) {
        return false;
    }
    if (isField(item) || isAdditionalMetric(item)) {
        const numericTypes: string[] = [
            DimensionType.NUMBER,
            MetricType.NUMBER,
            MetricType.AVERAGE,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.SUM,
            MetricType.MIN,
            MetricType.MAX,
        ];
        return numericTypes.includes(item.type);
    }
    return true;
};

export const findItem = (
    items: Array<Field | TableCalculation>,
    id: string | undefined,
) =>
    items.find((item) =>
        isField(item) ? fieldId(item) === id : item.name === id,
    );

export const getItemId = (item: Field | AdditionalMetric | TableCalculation) =>
    isField(item) || isAdditionalMetric(item) ? fieldId(item) : item.name;

export const getItemLabel = (item: Field | TableCalculation) =>
    isField(item) ? `${item.tableLabel} ${item.label}` : item.displayName;

export const getItemIcon = (
    item: Field | TableCalculation | AdditionalMetric,
) => {
    if (isField(item)) {
        return isDimension(item) ? 'tag' : 'numerical';
    }
    return 'function';
};

export const getItemColor = (
    item: Field | TableCalculation | AdditionalMetric,
) => {
    if (isField(item)) {
        return isDimension(item) ? '#0E5A8A' : '#A66321';
    }
    return '#0A6640';
};
