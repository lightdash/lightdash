import { type DashboardFilterRule } from '@lightdash/common';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import { isRuleRequired } from './requirements';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';

/** Why an editor's Apply is off: a required filter with no value, or one that reaches no tile. */
export const useApplyBlockedReason = (
    rule: DashboardFilterRule,
): string | null => {
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    const appliedTileCount = useAppliedTileCount(rule);
    if (isViewer || isPlaceholder) return null;
    if (isRuleRequired(rule) && !hasFilterValueSet(rule))
        return getUiString('filters.config.applyRequiredTooltip');
    return appliedTileCount === 0
        ? getUiString('filters.notAppliedToAnyTiles')
        : null;
};
