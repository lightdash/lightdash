import {
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
} from '@lightdash/common';

export const isRuleRequired = (rule: DashboardFilterRule): boolean =>
    !!rule.required || !!rule.requiredGroupId;

const isLockedOnEveryTab = (
    rule: DashboardFilterRule,
    tabUuids: string[],
): boolean => {
    const locked = rule.lockedTabUuids ?? [];
    if (locked.length === 0) return false;
    if (tabUuids.length === 0) return true;
    return tabUuids.every((uuid) => locked.includes(uuid));
};

/** Why a filter cannot be required; null when it can. */
export const getRequiredIneligibilityReason = (
    rule: DashboardFilterRule,
    tabUuids: string[],
): string | null => {
    if (isLockedOnEveryTab(rule, tabUuids)) {
        return 'Locked or hidden on every tab, so viewers could not set it';
    }
    if (!isRuleRequired(rule) && !isValuelessDashboardFilterRule(rule)) {
        return 'Has a default value, so the rule would always be satisfied';
    }
    return null;
};

export const setRuleRequired = (
    rule: DashboardFilterRule,
): DashboardFilterRule => ({
    ...rule,
    required: true,
    requiredGroupId: undefined,
});

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

const dissolveLoneGroups = (
    rules: DashboardFilterRule[],
): DashboardFilterRule[] =>
    rules.map((rule) => {
        if (!rule.requiredGroupId) return rule;
        const members = rules.filter(
            (other) => other.requiredGroupId === rule.requiredGroupId,
        );
        return members.length > 1 ? rule : setRuleRequired(rule);
    });

/** Removes the requirement; the rest of its group stays required. */
export const clearRequired = (
    rules: DashboardFilterRule[],
    filterId: string,
): DashboardFilterRule[] =>
    dissolveLoneGroups(
        rules.map((rule) =>
            rule.id === filterId ? withoutRequirement(rule) : rule,
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
    return dissolveLoneGroups(
        rules.map((rule) =>
            rule.id === filterId || rule.id === alternativeId
                ? asGroupMember(rule, groupId)
                : rule,
        ),
    );
};

export const removeAlternative = (
    rules: DashboardFilterRule[],
    alternativeId: string,
): DashboardFilterRule[] => clearRequired(rules, alternativeId);
