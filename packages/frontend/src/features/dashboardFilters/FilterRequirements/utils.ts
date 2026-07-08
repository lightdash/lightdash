import {
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterableItem,
} from '@lightdash/common';
import { getConditionalRuleLabelFromItem } from '../../../components/common/Filters/FilterInputs/utils';

export type FilterRequirementRule = {
    groupId: string;
    members: DashboardFilterRule[];
};

/**
 * A requirement "rule" is the set of dashboard filter rules sharing one
 * requiredGroupId. Rules are returned in first-appearance order
 * (dimensions before metrics).
 */
export const getFilterRequirementRules = (
    dashboardFilters: Pick<DashboardFilters, 'dimensions' | 'metrics'>,
): FilterRequirementRule[] => {
    const filterRules = [
        ...dashboardFilters.dimensions,
        ...dashboardFilters.metrics,
    ];

    return filterRules.reduce<FilterRequirementRule[]>((acc, filterRule) => {
        if (!filterRule.requiredGroupId) return acc;

        const existingRule = acc.find(
            (rule) => rule.groupId === filterRule.requiredGroupId,
        );
        if (existingRule) {
            existingRule.members.push(filterRule);
            return acc;
        }

        return [
            ...acc,
            { groupId: filterRule.requiredGroupId, members: [filterRule] },
        ];
    }, []);
};

/**
 * Why a dashboard filter can't be added to a requirement rule;
 * null when it is eligible. Rule members must be valueless
 * (disabled with no default), matching the value stripping applied
 * to required filters on dashboard save.
 */
export const getRequirementIneligibilityReason = (
    filterRule: DashboardFilterRule,
): string | null => {
    if (filterRule.requiredGroupId) {
        return 'Already part of a requirement rule';
    }
    if (filterRule.required) {
        return 'Individually required';
    }
    if (!filterRule.disabled) {
        return 'Has a default value, so the rule would always be satisfied';
    }
    return null;
};

export const getDashboardFilterRuleLabel = (
    filterRule: DashboardFilterRule,
    fieldsMap: Record<string, FilterableItem>,
): string => {
    if (filterRule.label) return filterRule.label;

    const field = fieldsMap[filterRule.target.fieldId];
    return field
        ? getConditionalRuleLabelFromItem(filterRule, field).field
        : filterRule.target.fieldId;
};
