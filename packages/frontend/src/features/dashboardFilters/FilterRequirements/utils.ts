import {
    getDashboardFilterField,
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type DashboardFilterableField,
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

export const getDashboardFilterRuleLabel = (
    filterRule: DashboardFilterRule,
    fieldsMap: Record<string, FilterableItem>,
    fieldsByTile?: Record<string, DashboardFilterableField[]>,
): string => {
    if (filterRule.label) return filterRule.label;

    const field = getDashboardFilterField(fieldsMap, filterRule, fieldsByTile);
    return field
        ? getConditionalRuleLabelFromItem(filterRule, field).field
        : filterRule.target.fieldId;
};

/** Options for the rule-member selects, with ineligible filters dimmed */
export const getSelectableFilters = (
    allFilterRules: DashboardFilterRule[],
    excludedIds: string[],
    fieldsMap: Record<string, FilterableItem>,
    fieldsByTile?: Record<string, DashboardFilterableField[]>,
): SelectableFilter[] =>
    allFilterRules
        .filter((rule) => !excludedIds.includes(rule.id))
        .map((rule) => {
            const reason = getRequirementIneligibilityReason(rule);
            return {
                value: rule.id,
                label: getDashboardFilterRuleLabel(
                    rule,
                    fieldsMap,
                    fieldsByTile,
                ),
                disabled: reason !== null,
                reason,
            };
        });
