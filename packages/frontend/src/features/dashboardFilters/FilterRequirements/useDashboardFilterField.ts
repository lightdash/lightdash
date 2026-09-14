import {
    getDashboardFilterField,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { useCallback } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useFilterableItemsMap } from './useFilterableItemsMap';

export type DashboardFilterFieldResolver = (
    filterRule: DashboardFilterRule,
) => FilterableItem | undefined;

/** Resolves a dashboard filter to the field it displays, honouring per-tile labels */
export const useDashboardFilterField = (): DashboardFilterFieldResolver => {
    const fieldsMap = useFilterableItemsMap();
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    return useCallback(
        (filterRule: DashboardFilterRule) =>
            getDashboardFilterField(
                fieldsMap,
                filterRule,
                filterableFieldsByTileUuid,
            ),
        [fieldsMap, filterableFieldsByTileUuid],
    );
};
