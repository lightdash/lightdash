import { interpolateUiString, type DashboardTile } from '@lightdash/common';
import { useMemo } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTab,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { getTilesOnTab } from './peers';
import { getTileTitle } from './tileProps';
import { getTileSelector } from './tileSelector';
import { usePortalTargets } from './usePortalTargets';

// The tiles on the tab in view and where each one's card goes, while
// `isActive`; every tile gets one, as the siblings are locked
export const useTabTileTargets = (isActive: boolean) => {
    const getUiString = useUiStrings();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTab = useDashboardSelector(selectActiveTab);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    // As the grid draws them: a tile with no tab, or a stale one, is on the
    // first tab
    const tiles = useMemo(() => {
        const all = dashboardTiles ?? [];
        return activeTab && dashboardTabs.length > 0
            ? getTilesOnTab(all, dashboardTabs, activeTab.uuid)
            : all;
    }, [dashboardTiles, dashboardTabs, activeTab]);
    const tileUuids = useMemo(() => tiles.map((tile) => tile.uuid), [tiles]);
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        isActive,
        true,
    );
    // "Revenue on Orders by month": a card's select, named for screen readers
    const selectLabelOf = (name: string, tile: DashboardTile) =>
        interpolateUiString(getUiString('filters.tileCard.selectName'), {
            filter: name,
            tile: getTileTitle(tile, getUiString('filters.tileCard.thisTile')),
        });
    return { tiles, targets, selectLabelOf };
};
