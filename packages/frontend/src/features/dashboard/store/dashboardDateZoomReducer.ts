import {
    type ChartZoomableField,
    type DateGranularity,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { keepTiles } from './dashboardParametersReducer';

export type DashboardDateZoomState = {
    /** Granularity of the default date zoom control */
    granularity: DateGranularity | string | undefined;
    /** Runtime overrides per named control; absent means its saved granularity */
    controlGranularities: Record<string, DateGranularity | string>;
    tilesWithDateZoomApplied: Set<string> | undefined;
    /** Date fields each chart tile can be zoomed on, reported by the tile */
    chartZoomableFieldsByTileUuid: Record<string, ChartZoomableField[]>;
};

export const initialDashboardDateZoomState: DashboardDateZoomState = {
    granularity: undefined,
    controlGranularities: {},
    tilesWithDateZoomApplied: undefined,
    chartZoomableFieldsByTileUuid: {},
};

export const dashboardDateZoomActions = {
    setGranularity: createAction<DateGranularity | string | undefined>(
        'dashboardDateZoom/setGranularity',
    ),
    setControlGranularity: createAction<{
        controlUuid: string;
        granularity: DateGranularity | string | undefined;
    }>('dashboardDateZoom/setControlGranularity'),
    clearControlGranularities: createAction(
        'dashboardDateZoom/clearControlGranularities',
    ),
    setTilesWithDateZoomApplied: createAction<Set<string> | undefined>(
        'dashboardDateZoom/setTilesWithDateZoomApplied',
    ),
    setChartZoomableFields: createAction<{
        tileUuid: string;
        fields: ChartZoomableField[];
    }>('dashboardDateZoom/setChartZoomableFields'),
    /** Drops zoomable fields of tiles no longer on the dashboard */
    keepTileDateZoomState: createAction<string[]>(
        'dashboardDateZoom/keepTileDateZoomState',
    ),
};

const haveSameMembers = (
    a: Set<string> | undefined,
    b: Set<string> | undefined,
) =>
    a !== undefined &&
    b !== undefined &&
    a.size === b.size &&
    [...a].every((tileUuid) => b.has(tileUuid));

export const dashboardDateZoomReducer = (
    state: DashboardDateZoomState = initialDashboardDateZoomState,
    action: UnknownAction,
): DashboardDateZoomState => {
    if (dashboardDateZoomActions.setGranularity.match(action)) {
        return state.granularity === action.payload
            ? state
            : { ...state, granularity: action.payload };
    }
    if (dashboardDateZoomActions.setControlGranularity.match(action)) {
        const { controlUuid, granularity } = action.payload;
        if (granularity === undefined) {
            const { [controlUuid]: _removed, ...rest } =
                state.controlGranularities;
            return { ...state, controlGranularities: rest };
        }
        return {
            ...state,
            controlGranularities: {
                ...state.controlGranularities,
                [controlUuid]: granularity,
            },
        };
    }
    if (dashboardDateZoomActions.clearControlGranularities.match(action)) {
        return { ...state, controlGranularities: {} };
    }
    if (dashboardDateZoomActions.setTilesWithDateZoomApplied.match(action)) {
        return haveSameMembers(state.tilesWithDateZoomApplied, action.payload)
            ? state
            : { ...state, tilesWithDateZoomApplied: action.payload };
    }
    if (dashboardDateZoomActions.setChartZoomableFields.match(action)) {
        const { tileUuid, fields } = action.payload;
        if (isEqual(state.chartZoomableFieldsByTileUuid[tileUuid], fields)) {
            return state;
        }
        return {
            ...state,
            chartZoomableFieldsByTileUuid: {
                ...state.chartZoomableFieldsByTileUuid,
                [tileUuid]: fields,
            },
        };
    }
    if (dashboardDateZoomActions.keepTileDateZoomState.match(action)) {
        const chartZoomableFieldsByTileUuid = keepTiles(
            state.chartZoomableFieldsByTileUuid,
            new Set(action.payload),
        );
        return chartZoomableFieldsByTileUuid ===
            state.chartZoomableFieldsByTileUuid
            ? state
            : { ...state, chartZoomableFieldsByTileUuid };
    }
    return state;
};
