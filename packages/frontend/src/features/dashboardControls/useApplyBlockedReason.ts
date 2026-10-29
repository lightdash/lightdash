import {
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';

// As the shipped requirement rules: `required` wins over a group, and a group
// is met by another member that filters (enabled, with a value)
const isMissingRequiredValue = (
    rule: DashboardFilterRule,
    filters: DashboardFilters,
): boolean => {
    if (hasFilterValueSet(rule)) return false;
    if (rule.required) return true;
    if (!rule.requiredGroupId) return false;
    return ![...filters.dimensions, ...filters.metrics].some(
        (other) =>
            other.id !== rule.id &&
            !other.required &&
            other.requiredGroupId === rule.requiredGroupId &&
            !isValuelessDashboardFilterRule(other),
    );
};

/** Why an editor's Apply is off: a required filter with no value, or one that reaches no tile. */
export const useApplyBlockedReason = (
    rule: DashboardFilterRule,
): string | null => {
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const editorFilters = useControlsSidebarSelector((c) => c.editorFilters);
    const getUiString = useUiStrings();
    const appliedTileCount = useAppliedTileCount(rule);
    if (isViewer || isPlaceholder) return null;
    if (isMissingRequiredValue(rule, editorFilters))
        return getUiString('filters.config.applyRequiredTooltip');
    return appliedTileCount === 0
        ? getUiString('filters.notAppliedToAnyTiles')
        : null;
};
