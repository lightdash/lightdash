import {
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
} from '@lightdash/common';
import { getConditionalRuleLabelFromItem } from '../../../components/common/Filters/FilterInputs/utils';
import i18n from '../../../i18n/i18n';
import { type SelectableFilter } from './FilterSelect';
import { type DashboardFilterFieldResolver } from './useDashboardFilterField';

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
        return i18n.t('requirements.ineligible.alreadyInRule', {
            ns: 'dashboardFilters',
        });
    }
    if (!isValuelessDashboardFilterRule(filterRule)) {
        return i18n.t('requirements.ineligible.hasDefault', {
            ns: 'dashboardFilters',
        });
    }
    return null;
};

export const getDashboardFilterRuleLabel = (
    filterRule: DashboardFilterRule,
    getField: DashboardFilterFieldResolver,
): string => {
    if (filterRule.label) return filterRule.label;

    const field = getField(filterRule);
    return field
        ? getConditionalRuleLabelFromItem(filterRule, field).field
        : filterRule.target.fieldId;
};

/** Options for the rule-member selects, with ineligible filters dimmed */
export const getSelectableFilters = (
    allFilterRules: DashboardFilterRule[],
    excludedIds: string[],
    getField: DashboardFilterFieldResolver,
): SelectableFilter[] =>
    allFilterRules
        .filter((rule) => !excludedIds.includes(rule.id))
        .map((rule) => {
            const reason = getRequirementIneligibilityReason(rule);
            return {
                value: rule.id,
                label: getDashboardFilterRuleLabel(rule, getField),
                disabled: reason !== null,
                reason,
            };
        });
