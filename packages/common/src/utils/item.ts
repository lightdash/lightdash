import { type Explore } from '../types/explore';
import {
    DimensionType,
    isCustomBinDimension,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isTableCalculation,
    MetricType,
    TableCalculationType,
    type CompiledDimension,
    type CustomDimension,
    type Dimension,
    type Field,
    type Item,
    type ItemsMap,
    type TableCalculation,
} from '../types/field';
import {
    isAdditionalMetric,
    type AdditionalMetric,
} from '../types/metricQuery';

export const isNumericType = (
    type: DimensionType | MetricType | TableCalculationType,
) => {
    const numericTypes = [
        TableCalculationType.NUMBER,
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
    return numericTypes.includes(type);
};

export const isNumericItem = (
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
) => {
    if (!item) {
        return false;
    }
    if (isCustomBinDimension(item)) return false;
    if (isCustomSqlDimension(item)) {
        return isNumericType(item.dimensionType);
    }
    if (isField(item) || isAdditionalMetric(item) || isTableCalculation(item)) {
        return isNumericType(
            item.type as DimensionType | MetricType | TableCalculationType,
        );
    }
    return true;
};

export const getItemId = (
    item: ItemsMap[string] | AdditionalMetric | Pick<Field, 'name' | 'table'>,
) => {
    if (isCustomDimension(item)) {
        return item.id;
    }
    if (isTableCalculation(item)) {
        return item.name;
    }
    // dimension or metric or additional metric or field
    return `${item.table}_${item.name.replaceAll('.', '__')}`;
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

export const canApplyFormattingToCustomMetric = (
    item: Dimension,
    customMetricType: MetricType,
) =>
    isNumericItem(item) ||
    [MetricType.COUNT_DISTINCT, MetricType.COUNT].includes(customMetricType);
