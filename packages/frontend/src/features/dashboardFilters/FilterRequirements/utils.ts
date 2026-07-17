import {
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { getConditionalRuleLabelFromItem } from '../../../components/common/Filters/FilterInputs/utils';
import { type SelectableFilter } from './FilterSelect';

// Rule derivation is shared with the dashboard lock (`getUnmetFilterRequirements`)
export {
    getFilterRequirementRules,
    isRequirementRuleSatisfied,
    type FilterRequirementRule,
} from '@lightdash/common';

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
    if (!isValuelessDashboardFilterRule(filterRule)) {
        return 'Has a default value, so the rule would always be satisfied';
    }
    return null;
};

/**
 * The legacy locked modal + blur only apply once the requirements feature
 * flag has settled as disabled; while the flag query is unresolved no
 * locked-state UI should render (tiles stay fail-closed regardless)
 */
export const shouldShowLegacyLockedState = ({
    isFlagResolved,
    isFilterRequirementsEnabled,
}: {
    isFlagResolved: boolean;
    isFilterRequirementsEnabled: boolean;
}): boolean => isFlagResolved && !isFilterRequirementsEnabled;

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

/** Options for the rule-member selects, with ineligible filters dimmed */
export const getSelectableFilters = (
    allFilterRules: DashboardFilterRule[],
    excludedIds: string[],
    fieldsMap: Record<string, FilterableItem>,
): SelectableFilter[] =>
    allFilterRules
        .filter((rule) => !excludedIds.includes(rule.id))
        .map((rule) => {
            const reason = getRequirementIneligibilityReason(rule);
            return {
                value: rule.id,
                label: getDashboardFilterRuleLabel(rule, fieldsMap),
                disabled: reason !== null,
                reason,
            };
        });
