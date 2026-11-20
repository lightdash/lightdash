import {
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
    type DashboardFilters,
    type UiStringResolver,
} from '@lightdash/common';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    hasFilterValueSet,
    isLockedRequiredMissingValue,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsEditorSelector } from './useControlsEditor';

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

/** Why Apply is off: a viewer's required filter with no value; an editor's locked, required filter with no value, or one that reaches no tile. */
export const getApplyBlockedReason = ({
    rule,
    filters,
    appliedTileCount,
    isViewer,
    getUiString,
}: {
    rule: DashboardFilterRule;
    /** Every filter as edited so far, this one too. */
    filters: DashboardFilters;
    appliedTileCount: number;
    isViewer: boolean;
    getUiString: UiStringResolver;
}): string | null => {
    // A viewer cannot clear a required filter, as the shipped popover: one
    // still off as it was saved was not cleared, so it applies unchanged
    if (isViewer)
        return !rule.disabled && isMissingRequiredValue(rule, filters)
            ? getUiString('filters.config.applyRequiredTooltip')
            : null;
    // An editor may leave it empty for viewers to set, unless it is locked
    if (isLockedRequiredMissingValue(rule))
        return getUiString('filters.config.applyLockedRequiredTooltip');
    return appliedTileCount === 0
        ? getUiString('filters.notAppliedToAnyTiles')
        : null;
};

/** `getApplyBlockedReason` for the edited filter; none for a placeholder. */
export const useApplyBlockedReason = (
    rule: DashboardFilterRule,
): string | null => {
    const isPlaceholder = useControlsEditorSelector((c) => c.isPlaceholder);
    const isViewer = useControlsEditorSelector((c) => c.isViewer);
    const editorFilters = useControlsEditorSelector((c) => c.editorFilters);
    const getUiString = useUiStrings();
    const appliedTileCount = useAppliedTileCount(rule);
    if (isPlaceholder) return null;
    return getApplyBlockedReason({
        rule,
        filters: editorFilters,
        appliedTileCount,
        isViewer,
        getUiString,
    });
};
