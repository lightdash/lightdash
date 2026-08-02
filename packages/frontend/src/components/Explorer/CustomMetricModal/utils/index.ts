import {
    CustomFormatType,
    DimensionType,
    friendlyName,
    getCustomFormatFromLegacy,
    isAdditionalMetric,
    isCustomBinDimension,
    isCustomDimension,
    isDimension,
    isMetric,
    MetricType,
    snakeCaseName,
    type AdditionalMetric,
    type CustomDimension,
    type CustomFormat,
    type Dimension,
    type Explore,
    type FilterRule,
    type getFilterableDimensionsFromItemsMap,
    type Metric,
    type MetricFilterRule,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
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

// YAML metric filters may use bare fieldRefs (relative to the metric's table);
// the filter form requires fully qualified `table.field` refs.
export const getFilterRulesFromMetricBaseFilters = (
    metric: Metric,
): MetricFilterRuleWithFieldId[] =>
    (metric.filters ?? []).map((filterRule) => {
        const fieldRef = filterRule.target.fieldRef.includes('.')
            ? filterRule.target.fieldRef
            : `${metric.table}.${filterRule.target.fieldRef}`;
        return addFieldIdToMetricFilterRule({
            ...filterRule,
            id: uuidv4(),
            target: { ...filterRule.target, fieldRef },
        });
    });

// Formatting the clone should inherit: structured formatOptions when present,
// otherwise any combination of legacy format/round/compact. The field-level
// separator composes with both shapes, so it carries over in either case.
export const getFormatFromBaseMetric = (
    metric: Metric,
): CustomFormat | undefined => {
    const hasLegacyFormat =
        metric.format !== undefined ||
        metric.round !== undefined ||
        metric.compact !== undefined;

    const base = metric.formatOptions
        ? { ...metric.formatOptions }
        : hasLegacyFormat || metric.separator !== undefined
          ? getCustomFormatFromLegacy({
                format: metric.format,
                round: metric.round,
                compact: metric.compact,
            })
          : undefined;

    if (!base) return undefined;
    if (metric.separator && !base.separator) {
        return { ...base, separator: metric.separator };
    }
    return base;
};

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
    item: Dimension | AdditionalMetric | CustomDimension | Metric,
    type: MetricType,
): Partial<AdditionalMetric> | undefined => {
    if (type !== MetricType.MIN && type !== MetricType.MAX) return;

    // Clones of MIN/MAX-of-date metrics keep the base metric's date formatting
    if (isMetric(item)) {
        switch (item.baseDimensionType) {
            case DimensionType.DATE:
                return {
                    formatOptions: {
                        type: CustomFormatType.DATE,
                        timeInterval: item.baseDimensionTimeInterval,
                    },
                };
            case DimensionType.TIMESTAMP:
                return {
                    formatOptions: {
                        type: CustomFormatType.TIMESTAMP,
                        timeInterval: item.baseDimensionTimeInterval,
                    },
                };
            default:
                return;
        }
    }

    if (!isDimension(item)) return;

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
    item: Dimension | AdditionalMetric | CustomDimension | Metric;
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
            isEditingCustomMetric && isAdditionalMetric(item)
                ? (item.baseDimensionName ?? item.baseMetricName ?? item.name)
                : isCustomDimension(item)
                  ? item.id // Custom dimensions have ids instead of names
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
            (isDimension(item) || isMetric(item)) && {
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
