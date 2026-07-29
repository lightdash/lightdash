import { type DashboardFilterRule } from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

export type FilterChipRequirementState = {
    showRequirementIcon: boolean;
    isRequirementUnmet: boolean;
    requirementTooltip: string;
};

export const useFilterChipRequirementState = (
    filterRule: DashboardFilterRule,
): FilterChipRequirementState => {
    const unmetFilterRequirements = useDashboardContext(
        (c) => c.unmetFilterRequirements,
    );

    return useMemo(() => {
        // Unmet state comes from the same context value that locks the
        // dashboard, so the chip can never contradict the lock
        const isRequirementUnmet = unmetFilterRequirements.some((requirement) =>
            requirement.type === 'single'
                ? requirement.filter.id === filterRule.id
                : requirement.filters.some((f) => f.id === filterRule.id),
        );

        // `required` wins over `requiredGroupId`, matching getFilterRequirementRules
        const isGroupMember =
            !!filterRule.requiredGroupId && !filterRule.required;

        return {
            showRequirementIcon:
                !!filterRule.required || !!filterRule.requiredGroupId,
            isRequirementUnmet,
            requirementTooltip: isGroupMember
                ? 'Required: set a value on this or an alternative filter to run this dashboard'
                : 'Required: set a value to run this dashboard',
        };
    }, [unmetFilterRequirements, filterRule]);
};
