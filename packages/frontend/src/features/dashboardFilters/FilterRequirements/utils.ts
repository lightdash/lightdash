import {
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterableItem,
} from '@lightdash/common';
import { getConditionalRuleLabelFromItem } from '../../../components/common/Filters/FilterInputs/utils';

export type FilterRequirementRule = {
    /**
     * `requiredGroupId` for shared rules; the filter's own id for one-member
     * rules expressed via `required: true`.
     */
    id: string;
    members: DashboardFilterRule[];
};

/**
 * Unified view of filter requirements: every requirement is a rule, a set of
 * filters where at least one must be set. `required: true` is a one-member
 * rule; filters sharing a `requiredGroupId` form one rule. Rules are returned
 * in first-appearance order (dimensions before metrics). `required` wins when
 * hand-authored JSON sets both flags on the same filter.
 */
export const getFilterRequirementRules = (
    dashboardFilters: Pick<DashboardFilters, 'dimensions' | 'metrics'>,
): FilterRequirementRule[] => {
    const filterRules = [
        ...dashboardFilters.dimensions,
        ...dashboardFilters.metrics,
    ];

    return filterRules.reduce<FilterRequirementRule[]>((acc, filterRule) => {
        if (filterRule.required) {
            return [...acc, { id: filterRule.id, members: [filterRule] }];
        }
        if (!filterRule.requiredGroupId) return acc;

        const existingRule = acc.find(
            (rule) => rule.id === filterRule.requiredGroupId,
        );
        if (existingRule) {
            existingRule.members.push(filterRule);
            return acc;
        }

        return [
            ...acc,
            { id: filterRule.requiredGroupId, members: [filterRule] },
        ];
    }, []);
};

/**
 * A rule is satisfied when any member has a value; members are `disabled`
 * until then, mirroring `getUnmetFilterRequirements`.
 */
export const isRequirementRuleSatisfied = (
    rule: FilterRequirementRule,
): boolean => rule.members.some((member) => !member.disabled);

/**
 * A single required filter is well served by the banner + chip popover; the
 * guided setup card earns its place once the viewer has several rules (or an
 * any-of choice) to work through.
 */
export const shouldShowGuidedFilterSetup = (
    rules: FilterRequirementRule[],
): boolean =>
    rules.length >= 2 || rules.some((rule) => rule.members.length >= 2);

/**
 * Why a dashboard filter can't be added to a filter rule; null when it is
 * eligible. Rule members must be valueless (disabled with no default),
 * matching the value stripping applied to required filters on dashboard save.
 */
export const getRequirementIneligibilityReason = (
    filterRule: DashboardFilterRule,
): string | null => {
    if (filterRule.required || filterRule.requiredGroupId) {
        return 'Already part of a filter rule';
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
