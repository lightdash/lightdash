import {
    getFilterRuleWithDefaultValue,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';

export const isRuleRequired = (rule: DashboardFilterRule): boolean =>
    !!rule.required || !!rule.requiredGroupId;

// What the shipped popover does to every edit: a value switches the default
// on, and a required filter with no value is off
const withShippedDisabledState = (
    rule: DashboardFilterRule,
): DashboardFilterRule => {
    const hasValue = !!hasFilterValueSet(rule);
    return {
        ...rule,
        disabled:
            (!!rule.disabled && !hasValue) ||
            (isRuleRequired(rule) && !hasValue),
    };
};

/** The shipped Apply guard: no viewer can satisfy this filter. */
export const isLockedRequiredMissingValue = (
    rule: DashboardFilterRule,
): boolean =>
    !!rule.lockedTabUuids?.length &&
    !!rule.required &&
    !hasFilterValueSet(rule);

const asGroupMember = (
    rule: DashboardFilterRule,
    groupId: string,
): DashboardFilterRule => ({
    ...rule,
    required: false,
    requiredGroupId: groupId,
    disabled: true,
    values: [],
});

const withoutRequirement = (
    rule: DashboardFilterRule,
): DashboardFilterRule => ({
    ...rule,
    required: false,
    requiredGroupId: undefined,
});

/**
 * Back in the rule it was saved in, else required on its own. A value the
 * filter has stays as a temporary one.
 */
export const setRuleRequired = (
    rule: DashboardFilterRule,
    savedRule: DashboardFilterRule | null,
): DashboardFilterRule =>
    withShippedDisabledState(
        savedRule?.requiredGroupId
            ? asGroupMember(rule, savedRule.requiredGroupId)
            : { ...rule, required: true, requiredGroupId: undefined },
    );

/** Out of its rule, and without the temporary value it may have had. */
export const clearRuleRequired = (
    rule: DashboardFilterRule,
    filterType: FilterType,
    field: DashboardFilterableField | null,
): DashboardFilterRule =>
    withShippedDisabledState(
        getFilterRuleWithDefaultValue(
            filterType,
            field ?? undefined,
            withoutRequirement(rule),
            null,
        ),
    );

export const getAlternativeIds = (
    rules: DashboardFilterRule[],
    filterId: string,
): string[] => {
    const groupId = rules.find((rule) => rule.id === filterId)?.requiredGroupId;
    if (!groupId) return [];
    return rules
        .filter((rule) => rule.requiredGroupId === groupId)
        .map((rule) => rule.id)
        .filter((id) => id !== filterId);
};

/** Puts both filters in one "at least one of" group. */
export const addAlternative = (
    rules: DashboardFilterRule[],
    filterId: string,
    alternativeId: string,
    newGroupId: string,
): DashboardFilterRule[] => {
    const groupId =
        rules.find((rule) => rule.id === filterId)?.requiredGroupId ??
        newGroupId;
    return rules.map((rule) =>
        rule.id === filterId || rule.id === alternativeId
            ? asGroupMember(rule, groupId)
            : rule,
    );
};

/** Takes one filter out; the rest of its rule stays as it is. */
export const removeAlternative = (
    rules: DashboardFilterRule[],
    alternativeId: string,
): DashboardFilterRule[] =>
    rules.map((rule) =>
        rule.id === alternativeId ? withoutRequirement(rule) : rule,
    );
