import { type DashboardFilterRule } from '@lightdash/common';
import { useCallback } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { isLockedDashboardFilterRule } from './lockedFilters';

export const useIsLockedDashboardFilterRule = () => {
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const hiddenFilterableFieldIds = useDashboardContext(
        (c) => c.hiddenFilterableFieldIds,
    );
    return useCallback(
        (filterRule: DashboardFilterRule) =>
            isLockedDashboardFilterRule(filterRule, {
                filterableFieldsByTileUuid,
                hiddenFilterableFieldIds,
            }),
        [filterableFieldsByTileUuid, hiddenFilterableFieldIds],
    );
};
