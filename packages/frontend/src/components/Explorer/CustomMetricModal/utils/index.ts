import { Field, FilterRule, MetricFilterRule } from '@lightdash/common';
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
