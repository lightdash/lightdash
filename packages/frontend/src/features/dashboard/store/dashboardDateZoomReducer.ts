import {
    type ChartZoomableField,
    type DateGranularity,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { keepTiles } from './dashboardParametersReducer';

export type DashboardDateZoomState = {
    /** Granularity of the default date zoom control */
    granularity: DateGranularity | string | undefined;
    /** Runtime overrides per named control; absent means its saved granularity */
    controlGranularities: Record<string, DateGranularity | string>;
    tilesWithDateZoomApplied: Set<string> | undefined;
    /** Date fields each chart tile can be zoomed on, reported by the tile */
    chartZoomableFieldsByTileUuid: Record<string, ChartZoomableField[]>;
    /**
     * Chart tiles that keep their saved grain under date zoom (live data
     * sources), reported by the tile once its explore loads
     */
    dateZoomRefusedByTileUuid: Record<string, boolean>;
};

export const initialDashboardDateZoomState: DashboardDateZoomState = {
    granularity: undefined,
    controlGranularities: {},
    tilesWithDateZoomApplied: undefined,
    chartZoomableFieldsByTileUuid: {},
    dateZoomRefusedByTileUuid: {},
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
    setTileDateZoomRefused: createAction<{
        tileUuid: string;
        isRefused: boolean;
    }>('dashboardDateZoom/setTileDateZoomRefused'),
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
    if (dashboardDateZoomActions.setTileDateZoomRefused.match(action)) {
        const { tileUuid, isRefused } = action.payload;
        if (state.dateZoomRefusedByTileUuid[tileUuid] === isRefused) {
            return state;
        }
        return {
            ...state,
            dateZoomRefusedByTileUuid: {
                ...state.dateZoomRefusedByTileUuid,
                [tileUuid]: isRefused,
            },
        };
    }
    if (dashboardDateZoomActions.keepTileDateZoomState.match(action)) {
        const tileUuids = new Set(action.payload);
        const chartZoomableFieldsByTileUuid = keepTiles(
            state.chartZoomableFieldsByTileUuid,
            tileUuids,
        );
        const dateZoomRefusedByTileUuid = keepTiles(
            state.dateZoomRefusedByTileUuid,
            tileUuids,
        );
        return chartZoomableFieldsByTileUuid ===
            state.chartZoomableFieldsByTileUuid &&
            dateZoomRefusedByTileUuid === state.dateZoomRefusedByTileUuid
            ? state
            : {
                  ...state,
                  chartZoomableFieldsByTileUuid,
                  dateZoomRefusedByTileUuid,
              };
    }
    return state;
};
