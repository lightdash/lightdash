import { type SortField } from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';

export type DashboardChartSortState = {
    /** Viewer-chosen sorts per chart tile; absent means the chart's saved sort */
    sortsByTileUuid: Record<string, SortField[]>;
};

export const initialDashboardChartSortState: DashboardChartSortState = {
    sortsByTileUuid: {},
};

export const dashboardChartSortActions = {
    /** Replaces the tile's sorts; an empty list clears them */
    setTileSorts: createAction<{ tileUuid: string; sorts: SortField[] }>(
        'dashboardChartSort/setTileSorts',
    ),
};

export const dashboardChartSortReducer = (
    state: DashboardChartSortState = initialDashboardChartSortState,
    action: UnknownAction,
): DashboardChartSortState => {
    if (dashboardChartSortActions.setTileSorts.match(action)) {
        const { tileUuid, sorts } = action.payload;
        if (isEqual(state.sortsByTileUuid[tileUuid] ?? [], sorts)) {
            return state;
        }
        const { [tileUuid]: _previous, ...rest } = state.sortsByTileUuid;
        return {
            ...state,
            sortsByTileUuid:
                sorts.length > 0 ? { ...rest, [tileUuid]: sorts } : rest,
        };
    }
    return state;
};
