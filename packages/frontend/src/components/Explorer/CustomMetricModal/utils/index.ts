import {
    CustomFormatType,
    DimensionType,
    friendlyName,
    isAdditionalMetric,
    isCustomBinDimension,
    isCustomDimension,
    isDimension,
    MetricType,
    snakeCaseName,
    type AdditionalMetric,
    type CustomDimension,
    type CustomFormat,
    type Dimension,
    type Explore,
    type FilterRule,
    type getFilterableDimensionsFromItemsMap,
    type MetricFilterRule,
} from '@lightdash/common';
import { type MetricFilterRuleWithFieldId } from '../FilterForm';

export const addFieldRefToFilterRule = (
    filterRule: FilterRule,
    fields: ReturnType<typeof getFilterableDimensionsFromItemsMap>,
): MetricFilterRuleWithFieldId => {
    const field = fields[filterRule.target.fieldId];
    return {
        ...filterRule,
        target: {
            ...filterRule.target,
            fieldRef: `${field.table}.${field.name}`,
        },
    };
};

export const addFieldIdToMetricFilterRule = (
    filterRule: MetricFilterRule,
): MetricFilterRuleWithFieldId => ({
    ...filterRule,
    target: {
        ...filterRule.target,
        fieldId: `${filterRule.target.fieldRef.split('.')[0]}_${
            filterRule.target.fieldRef.split('.')[1]
        }`,
    },
});

export const getCustomMetricName = (
    table: string,
    label: string,
    dimensionName: string,
) => {
    // Some warehouses don't support long names, so we need to truncate these custom metrics if the name is too long
    if (table.length + dimensionName.length + label.length <= 62) {
        return `${dimensionName}_${snakeCaseName(label)}`;
    }

    // 64 (max characters in postgres) - 3 (underscores) - 14 (timestamp length) = 47
    const maxPartLength = Math.floor((47 - table.length) / 2);
    // If the name is still too long, we truncate each part and add a timestamp to the end to make it unique
    return `${dimensionName.slice(0, maxPartLength)}_${snakeCaseName(
        label,
    ).slice(0, maxPartLength)}_${new Date().getTime()}`;
};

const getCustomMetricDescription = (
    metricType: MetricType,
    label: string,
    tableLabel: string,
    filters: MetricFilterRule[],
) =>
    `${friendlyName(metricType)} of ${label} on the table ${tableLabel} ${
        filters.length > 0
            ? `with filters ${filters
                  .map((filter) => filter.target.fieldRef)
                  .join(', ')}`
            : ''
    }`;

const getTypeOverridesForAdditionalMetric = (
    item: Dimension | AdditionalMetric | CustomDimension,
    type: MetricType,
): Partial<AdditionalMetric> | undefined => {
    if (!isDimension(item)) return;

    switch (type) {
        case MetricType.MIN:
        case MetricType.MAX:
            switch (item.type) {
                case DimensionType.DATE:
                    return {
                        formatOptions: {
                            type: CustomFormatType.DATE,
                            timeInterval: item.timeInterval,
                        },
                    };
                case DimensionType.TIMESTAMP:
                    return {
                        formatOptions: {
                            type: CustomFormatType.TIMESTAMP,
                            timeInterval: item.timeInterval,
                        },
                    };
                default:
                    return;
            }
        default:
            return;
    }
};

export const prepareCustomMetricData = ({
    item,
    type,
    customMetricLabel,
    customMetricFiltersWithIds,
    isEditingCustomMetric,
    exploreData,
    percentile: metricPercentile,
    formatOptions,
}: {
    item: Dimension | AdditionalMetric | CustomDimension;
    type: MetricType;
    customMetricLabel: string;
    customMetricFiltersWithIds: MetricFilterRuleWithFieldId[];
    isEditingCustomMetric: boolean;
    exploreData?: Explore;
    percentile?: number;
    formatOptions?: CustomFormat;
}): AdditionalMetric => {
    if (isCustomBinDimension(item))
        throw new Error('Cannot create custom metric from bin dimension');
    const shouldCopyFormatting = [
        MetricType.PERCENTILE,
        MetricType.MEDIAN,
        MetricType.AVERAGE,
        MetricType.SUM,
        MetricType.MIN,
        MetricType.MAX,
    ].includes(type);

    const compact =
        !isCustomDimension(item) && shouldCopyFormatting && item.compact
            ? { compact: item.compact }
            : {};
    const format =
        !isCustomDimension(item) && shouldCopyFormatting && item.format
            ? { format: item.format }
            : {};

    const defaultRound = type === MetricType.AVERAGE ? { round: 2 } : {};
    const round =
        !isCustomDimension(item) && shouldCopyFormatting && item.round
            ? { round: item.round }
            : defaultRound;

    const percentile =
        type === MetricType.PERCENTILE ? metricPercentile || 50 : undefined;

    const customMetricFilters: MetricFilterRule[] =
        customMetricFiltersWithIds.map(
            ({
                target: { fieldId, ...restTarget },
                ...customMetricFilter
            }) => ({
                ...customMetricFilter,
                target: restTarget,
            }),
        );

    const tableLabel = exploreData?.tables[item.table].label;
    const label = isCustomDimension(item) ? item.name : item.label;
    return {
        table: item.table,
        sql: item.sql,
        type,
        ...format,
        ...round,
        ...compact,
        formatOptions,
        percentile,
        filters: customMetricFilters.length > 0 ? customMetricFilters : [],
        label: customMetricLabel,
        name: getCustomMetricName(
            item.table,
            customMetricLabel,
            isEditingCustomMetric &&
                isAdditionalMetric(item) &&
                'baseDimensionName' in item &&
                item.baseDimensionName
                ? item.baseDimensionName
                : item.name,
        ),
        ...(isEditingCustomMetric &&
            label &&
            tableLabel && {
                description: getCustomMetricDescription(
                    type,
                    label,
                    tableLabel,
                    customMetricFilters,
                ),
            }),
        ...(!isEditingCustomMetric &&
            isDimension(item) && {
                description: getCustomMetricDescription(
                    type,
                    item.label,
                    item.tableLabel,
                    customMetricFilters,
                ),
            }),

        ...getTypeOverridesForAdditionalMetric(item, type),
    };
};
