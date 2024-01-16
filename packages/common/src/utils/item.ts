import { Explore } from '../types/explore';
import {
    CompiledDimension,
    CustomDimension,
    DimensionType,
    Field,
    fieldId,
    isDimension,
    isField,
    Item,
    MetricType,
    TableCalculation,
} from '../types/field';
import {
    AdditionalMetric,
    getCustomDimensionId,
    isAdditionalMetric,
    isCustomDimension,
} from '../types/metricQuery';

export const isNumericItem = (
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): boolean => {
    if (!item) {
        return false;
    }
    if (isCustomDimension(item)) return false;
    if (isField(item) || isAdditionalMetric(item)) {
        const numericTypes: string[] = [
            DimensionType.NUMBER,
            MetricType.NUMBER,
            MetricType.PERCENTILE,
            MetricType.MEDIAN,
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
    items: Array<Field | TableCalculation | CustomDimension>,
    id: string | undefined,
) =>
    items.find((item) =>
        isField(item) ? fieldId(item) === id : item.name === id,
    );

export const getItemId = (
    item: Field | AdditionalMetric | TableCalculation | CustomDimension,
) => {
    if (isCustomDimension(item)) return getCustomDimensionId(item);

    return isField(item) || isAdditionalMetric(item)
        ? fieldId(item)
        : item.name;
};

export const getItemLabelWithoutTableName = (item: Item) => {
    if (isCustomDimension(item)) return item.name;
    return isField(item) || isAdditionalMetric(item)
        ? `${item.label}`
        : item.displayName;
};

export const getItemLabel = (item: Item) =>
    (isField(item) ? `${item.tableLabel} ` : '') +
    getItemLabelWithoutTableName(item);

export const getItemIcon = (
    item: Field | TableCalculation | AdditionalMetric | CustomDimension,
) => {
    if (isCustomDimension(item)) return 'tag';

    if (isField(item)) {
        return isDimension(item) ? 'tag' : 'numerical';
    }
    return 'function';
};

export const getItemColor = (
    item: Field | TableCalculation | AdditionalMetric | CustomDimension,
) => {
    if (isCustomDimension(item)) return '#0E5A8A';
    if (isField(item)) {
        return isDimension(item) ? '#0E5A8A' : '#A66321';
    }
    return '#0A6640';
};

export const isDateItem = (
    item: Field | AdditionalMetric | TableCalculation | undefined,
): boolean => {
    if (!item) {
        return false;
    }
    if (isField(item) || isAdditionalMetric(item)) {
        const dateTypes: string[] = [
            DimensionType.DATE,
            MetricType.DATE,
            DimensionType.TIMESTAMP,
            MetricType.TIMESTAMP,
        ];
        return dateTypes.includes(item.type);
    }
    return true;
};

export const replaceDimensionInExplore = (
    explore: Explore,
    dimension: CompiledDimension,
) => ({
    ...explore,
    tables: {
        ...explore.tables,
        [dimension.table]: {
            ...explore.tables[dimension.table],
            dimensions: {
                ...explore.tables[dimension.table].dimensions,
                [dimension.name]: dimension,
            },
        },
    },
});
