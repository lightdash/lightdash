import { type DashboardFilterRule } from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { hasFilterValueSet } from '../FilterConfiguration/utils';

export type FilterChipRequirementState = {
    // Rules mode (flag on); all false/empty when the flag is off
    showRequirementIcon: boolean;
    isRequirementUnmet: boolean;
    requirementTooltip: string;
    // Legacy mode (flag off); always false when the flag is on
    showLegacyRequiredIndicator: boolean;
};

export const useFilterChipRequirementState = (
    filterRule: DashboardFilterRule,
): FilterChipRequirementState => {
    const isFilterRequirementsEnabled = useDashboardContext(
        (c) => c.isFilterRequirementsEnabled,
    );
    const unmetFilterRequirements = useDashboardContext(
        (c) => c.unmetFilterRequirements,
    );

    return useMemo(() => {
        if (!isFilterRequirementsEnabled) {
            return {
                showRequirementIcon: false,
                isRequirementUnmet: false,
                requirementTooltip: '',
                showLegacyRequiredIndicator:
                    !!filterRule.required && !hasFilterValueSet(filterRule),
            };
        }

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
            showLegacyRequiredIndicator: false,
        };
    }, [isFilterRequirementsEnabled, unmetFilterRequirements, filterRule]);
};
