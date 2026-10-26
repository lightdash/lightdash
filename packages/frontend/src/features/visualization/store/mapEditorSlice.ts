import {
    MapChartLocation,
    MapChartType,
    MapTileBackground,
    type MapChart,
    type MapFieldConfig,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { editorCaseReducers } from './editorSlice';

// Default colors for scatter/area maps (2 colors by default)
export const DEFAULT_MAP_COLORS = ['#228be6', '#fa5252']; // blue to red

// Default colors for heatmap (classic heatmap gradient)
export const DEFAULT_HEATMAP_COLORS = [
    '#3b4cc0', // blue
    '#7092e5', // light blue
    '#aac7fd', // very light blue
    '#f7b89c', // light orange
    '#e7553c', // red-orange
]; // blue to red through white

export type MapHeatmapConfig = {
    radius?: number;
    blur?: number;
    opacity?: number;
};

export type MapEditorState = {
    mapType: MapChartLocation | undefined;
    customGeoJsonUrl: string | undefined;
    locationType: MapChartType | undefined;
    latitudeFieldId: string | undefined;
    longitudeFieldId: string | undefined;
    locationFieldId: string | undefined;
    geoJsonPropertyKey: string | undefined;
    valueFieldId: string | undefined;
    colorRange: string[];
    showLegend: boolean;
    /** UI-only: whether pans/zooms are captured into the saved extent */
    saveMapExtent: boolean;
    defaultZoom: number | undefined;
    defaultCenterLat: number | undefined;
    defaultCenterLon: number | undefined;
    minBubbleSize: number | undefined;
    maxBubbleSize: number | undefined;
    sizeFieldId: string | undefined;
    hexbinConfig: MapChart['hexbinConfig'];
    heatmapConfig: MapHeatmapConfig | undefined;
    tileBackground: MapTileBackground | undefined;
    darkModeTileBackground: MapTileBackground | undefined;
    backgroundColor: string | undefined;
    noDataColor: string | undefined;
    dataLayerOpacity: number | undefined;
    colorOverrides: Record<string, string>;
    fieldConfig: Record<string, MapFieldConfig>;
};

export const buildMapEditorState = (
    initialConfig: MapChart | undefined,
): MapEditorState => ({
    mapType: initialConfig?.mapType ?? MapChartLocation.WORLD,
    customGeoJsonUrl: initialConfig?.customGeoJsonUrl,
    locationType: initialConfig?.locationType ?? MapChartType.SCATTER,
    latitudeFieldId: initialConfig?.latitudeFieldId,
    longitudeFieldId: initialConfig?.longitudeFieldId,
    locationFieldId: initialConfig?.locationFieldId,
    geoJsonPropertyKey: initialConfig?.geoJsonPropertyKey,
    valueFieldId: initialConfig?.valueFieldId,
    colorRange: initialConfig?.colorRange ?? DEFAULT_MAP_COLORS,
    showLegend: initialConfig?.showLegend ?? false,
    saveMapExtent: true,
    defaultZoom: initialConfig?.defaultZoom,
    defaultCenterLat: initialConfig?.defaultCenterLat,
    defaultCenterLon: initialConfig?.defaultCenterLon,
    minBubbleSize: initialConfig?.minBubbleSize,
    maxBubbleSize: initialConfig?.maxBubbleSize,
    sizeFieldId: initialConfig?.sizeFieldId,
    hexbinConfig: initialConfig?.hexbinConfig,
    heatmapConfig: initialConfig?.heatmapConfig,
    tileBackground:
        initialConfig?.tileBackground ?? MapTileBackground.OPENSTREETMAP,
    darkModeTileBackground: initialConfig?.darkModeTileBackground,
    backgroundColor: initialConfig?.backgroundColor,
    noDataColor: initialConfig?.noDataColor,
    dataLayerOpacity: initialConfig?.dataLayerOpacity,
    colorOverrides: initialConfig?.colorOverrides ?? {},
    fieldConfig: initialConfig?.fieldConfig ?? {},
});

const mapEditorSlice = createSlice({
    name: 'mapEditor',
    initialState: null as MapEditorState | null,
    reducers: {
        ...editorCaseReducers<MapEditorState>(),
        // Switching to/from heatmap swaps in that mode's default colors
        locationTypeChange: (
            state,
            action: PayloadAction<MapChartType | undefined>,
        ) => {
            if (!state) return;
            const wasHeatmap = state.locationType === MapChartType.HEATMAP;
            const isNowHeatmap = action.payload === MapChartType.HEATMAP;
            state.locationType = action.payload;
            if (!wasHeatmap && isNowHeatmap) {
                state.colorRange = DEFAULT_HEATMAP_COLORS;
            } else if (wasHeatmap && !isNowHeatmap) {
                state.colorRange = DEFAULT_MAP_COLORS;
            }
        },
        // Changing the color field drops its categorical overrides
        valueFieldIdChange: (
            state,
            action: PayloadAction<string | undefined>,
        ) => {
            if (!state) return;
            state.valueFieldId = action.payload;
            state.colorOverrides = {};
        },
        addColor: (state) => {
            if (!state || state.colorRange.length >= 5) return;
            state.colorRange.splice(state.colorRange.length - 1, 0, '#fab005');
        },
        removeColor: (state, action: PayloadAction<number>) => {
            if (!state || state.colorRange.length <= 2) return;
            state.colorRange.splice(action.payload, 1);
        },
        updateColor: (
            state,
            action: PayloadAction<{ index: number; color: string }>,
        ) => {
            if (!state) return;
            state.colorRange[action.payload.index] = action.payload.color;
        },
        heatmapConfigChange: (
            state,
            action: PayloadAction<MapHeatmapConfig | undefined>,
        ) => {
            if (!state) return;
            if (action.payload === undefined) {
                state.heatmapConfig = undefined;
                return;
            }
            state.heatmapConfig = {
                radius: state.heatmapConfig?.radius ?? 25,
                blur: state.heatmapConfig?.blur ?? 15,
                opacity: state.heatmapConfig?.opacity ?? 0.6,
                ...action.payload,
            };
        },
        hexbinConfigChange: (
            state,
            action: PayloadAction<NonNullable<MapChart['hexbinConfig']> | undefined>,
        ) => {
            if (!state) return;
            state.hexbinConfig =
                action.payload === undefined
                    ? undefined
                    : { ...state.hexbinConfig, ...action.payload };
        },
        colorOverrideChange: (
            state,
            action: PayloadAction<{ value: string; color: string }>,
        ) => {
            if (!state) return;
            state.colorOverrides[action.payload.value] = action.payload.color;
        },
        fieldConfigUpdate: (
            state,
            action: PayloadAction<{
                fieldId: string;
                config: Partial<MapFieldConfig>;
            }>,
        ) => {
            if (!state) return;
            const { fieldId, config } = action.payload;
            state.fieldConfig[fieldId] = {
                ...state.fieldConfig[fieldId],
                ...config,
            };
        },
    },
});

export const mapEditorActions = mapEditorSlice.actions;
export const mapEditorReducer = mapEditorSlice.reducer;
