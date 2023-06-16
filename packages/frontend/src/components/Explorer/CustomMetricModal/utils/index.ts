import {
    AdditionalMetric,
    Dimension,
    Explore,
    Field,
    FilterRule,
    friendlyName,
    isAdditionalMetric,
    isDimension,
    MetricFilterRule,
    MetricType,
    snakeCaseName,
} from '@lightdash/common';
import { MetricFilterRuleWithFieldId } from '../FilterForm';

export const addFieldRefToFilterRule = (
    filterRule: FilterRule,
    fields: Record<string, Field>,
): MetricFilterRuleWithFieldId => ({
    ...filterRule,
    target: {
        ...filterRule.target,
        fieldRef: `${fields[filterRule.target.fieldId].table}.${
            fields[filterRule.target.fieldId].name
        }`,
    },
});

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

export const getCustomMetricName = (label: string, dimensionName: string) =>
    `${dimensionName}_${snakeCaseName(label)}`;

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

export const prepareCustomMetricData = ({
    dimension,
    type,
    customMetricLabel,
    customMetricFiltersWithIds,
    isEditMode,
    item,
    exploreData,
}: {
    dimension: Dimension | AdditionalMetric;
    type: MetricType;
    customMetricLabel: string;
    customMetricFiltersWithIds: MetricFilterRuleWithFieldId[];
    isEditMode: boolean;
    item: Dimension | AdditionalMetric;
    exploreData?: Explore;
}) => {
    const shouldCopyFormatting = [
        MetricType.PERCENTILE,
        MetricType.MEDIAN,
        MetricType.AVERAGE,
        MetricType.SUM,
        MetricType.MIN,
        MetricType.MAX,
    ].includes(type);
    const compact =
        shouldCopyFormatting && dimension.compact
            ? { compact: dimension.compact }
            : {};
    const format =
        shouldCopyFormatting && dimension.format
            ? { format: dimension.format }
            : {};

    const defaultRound = type === MetricType.AVERAGE ? { round: 2 } : {};
    const round =
        shouldCopyFormatting && dimension.round
            ? { round: dimension.round }
            : defaultRound;

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

    return {
        ...format,
        ...round,
        ...compact,
        filters: customMetricFilters.length > 0 ? customMetricFilters : [],
        label: customMetricLabel,
        name: getCustomMetricName(
            customMetricLabel,
            isEditMode &&
                isAdditionalMetric(item) &&
                'baseDimensionName' in item &&
                item.baseDimensionName
                ? item.baseDimensionName
                : item.name,
        ),
        ...(isEditMode &&
            dimension.label &&
            tableLabel && {
                description: getCustomMetricDescription(
                    type,
                    dimension.label,
                    tableLabel,
                    customMetricFilters,
                ),
            }),
        ...(!isEditMode &&
            isDimension(dimension) && {
                description: getCustomMetricDescription(
                    type,
                    dimension.label,
                    dimension.tableLabel,
                    customMetricFilters,
                ),
            }),
    };
};
