import { type Explore } from '../types/explore';
import {
    DimensionType,
    MetricType,
    TableCalculationType,
    isCustomBinDimension,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    type CompiledDimension,
    type CustomDimension,
    type CustomSqlDimension,
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
        MetricType.PERCENT_OF_PREVIOUS,
        MetricType.PERCENT_OF_TOTAL,
        MetricType.RUNNING_TOTAL,
    ];
    return numericTypes.includes(type);
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

export function getItemType(
    item: ItemsMap[string] | AdditionalMetric,
): DimensionType | MetricType | TableCalculationType {
    if (isDimension(item) || isMetric(item)) {
        return item.type;
    }
    if (isCustomSqlDimension(item)) {
        return item.dimensionType;
    }
    if (isCustomBinDimension(item)) {
        return DimensionType.STRING;
    }
    if (isTableCalculation(item)) {
        return item.type ?? TableCalculationType.NUMBER;
    }
    if (isAdditionalMetric(item)) {
        return item.type;
    }
    return DimensionType.STRING;
}

export function isNumericItem(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
) {
    if (!item) {
        return false;
    }
    return isNumericType(getItemType(item));
}

export const isStringDimension = (
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
    return isDimension(item) && getItemType(item) === DimensionType.STRING;
};

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
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomSqlDimension
        | undefined,
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

/**
 * When selecting a field for the x axis,
 * we want to prioritize dimensions and date items
 * over metrics and table calculations
 * Used in CustomVisTemplate.tsx
 */
export const sortedItemsForXAxis = (
    itemsMap: ItemsMap | undefined,
): ItemsMap[string][] =>
    Object.values(itemsMap || {}).sort((a, b) => {
        const getPriority = (item: ItemsMap[string]) => {
            if (isDimension(item) && isDateItem(item)) return 1;
            if (isDimension(item)) return 2;
            if (isCustomDimension(item)) return 3;
            if (isMetric(item)) return 4;
            return 5; // everything else
        };
        return getPriority(a) - getPriority(b);
    });

/**
 * When selecting a field for the y axis (and color/size values),
 * we want to prioritize numeric metrics and table calculations
 * over dimensions
 */
export const sortedItemsForYAxis = (
    itemsMap: ItemsMap | undefined,
): ItemsMap[string][] =>
    Object.values(itemsMap || {}).sort((a, b) => {
        const getPriorityForY = (item: ItemsMap[string]) => {
            if (isMetric(item) && isNumericType(item.type)) return 1;
            if (isMetric(item)) return 2;
            if (isTableCalculation(item)) return 3;
            return 4; // everything else
        };

        return getPriorityForY(a) - getPriorityForY(b);
    });
