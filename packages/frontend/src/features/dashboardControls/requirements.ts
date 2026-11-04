import { type DashboardFilterRule } from '@lightdash/common';

export const isRuleRequired = (rule: DashboardFilterRule): boolean =>
    !!rule.required || !!rule.requiredGroupId;

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
