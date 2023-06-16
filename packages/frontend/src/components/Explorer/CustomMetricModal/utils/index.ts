import {
    AdditionalMetric,
    Dimension,
    Field,
    FilterRule,
    friendlyName,
    isAdditionalMetric,
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

export const getCustomMetricName = (
    label: string,
    item: AdditionalMetric | Dimension,
    isEditMode: boolean,
) => {
    const baseName =
        isEditMode && isAdditionalMetric(item) && 'baseDimensionName' in item
            ? item.baseDimensionName
            : item.name;

    return `${baseName}_${snakeCaseName(label)}`;
};

export const getCustomMetricDescription = (
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
