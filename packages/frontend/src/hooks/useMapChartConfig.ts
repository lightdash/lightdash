import {
    ChartType,
    MapChartLocation,
    MapChartType,
    type MapChart,
    type MapFieldConfig,
    type MapTileBackground,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useVisualizationInputSelector } from '../components/LightdashVisualization/useVisualizationContext';
import {
    mapEditorActions,
    selectMapEditor,
    selectMapValidConfig,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    type MapEditorState,
} from '../features/visualization/store';
import {
    DEFAULT_MAP_COLORS,
    type MapHeatmapConfig,
} from '../features/visualization/store/mapEditorSlice';

export { DEFAULT_MAP_COLORS };

export type MapEditorActions = {
    setMapType: (mapType: MapChartLocation | undefined) => void;
    setCustomGeoJsonUrl: (url: string | undefined) => void;
    setLocationType: (locationType: MapChartType | undefined) => void;
    setLatitudeFieldId: (fieldId: string | undefined) => void;
    setLongitudeFieldId: (fieldId: string | undefined) => void;
    setLocationFieldId: (fieldId: string | undefined) => void;
    setGeoJsonPropertyKey: (key: string | undefined) => void;
    autoFillAreaLocation: (
        locationFieldId: string,
        geoJsonPropertyKey: string,
    ) => void;
    setValueFieldId: (fieldId: string | undefined) => void;
    setColorRange: (colors: string[]) => void;
    addColor: () => void;
    removeColor: (index: number) => void;
    updateColor: (index: number, color: string) => void;
    setShowLegend: (show: boolean) => void;
    setSaveMapExtent: (save: boolean) => void;
    setDefaultZoom: (zoom: number | undefined) => void;
    setDefaultCenterLat: (lat: number | undefined) => void;
    setDefaultCenterLon: (lon: number | undefined) => void;
    setMinBubbleSize: (size: number | undefined) => void;
    setMaxBubbleSize: (size: number | undefined) => void;
    setSizeFieldId: (fieldId: string | undefined) => void;
    setHeatmapConfig: (config: MapHeatmapConfig | undefined) => void;
    setHexbinConfig: (
        config: NonNullable<MapChart['hexbinConfig']> | undefined,
    ) => void;
    setTileBackground: (background: MapTileBackground | undefined) => void;
    setDarkModeTileBackground: (
        background: MapTileBackground | undefined,
    ) => void;
    setBackgroundColor: (color: string | undefined) => void;
    setNoDataColor: (color: string | undefined) => void;
    setDataLayerOpacity: (opacity: number | undefined) => void;
    setColorOverride: (value: string, color: string) => void;
    setColorOverrides: (overrides: Record<string, string>) => void;
    updateFieldConfig: (
        fieldId: string,
        config: Partial<MapFieldConfig>,
    ) => void;
};

/** Stable map editor actions. */
export const useMapEditorActions = (): MapEditorActions => {
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<MapEditorState>(mapEditorActions.set);
    return useMemo(
        () => ({
            setMapType: (mapType) => set('mapType', mapType),
            setCustomGeoJsonUrl: (url) => set('customGeoJsonUrl', url),
            setLocationType: (value) =>
                dispatch(mapEditorActions.locationTypeChange(value)),
            setLatitudeFieldId: (fieldId) => set('latitudeFieldId', fieldId),
            setLongitudeFieldId: (fieldId) => set('longitudeFieldId', fieldId),
            setLocationFieldId: (fieldId) => set('locationFieldId', fieldId),
            setGeoJsonPropertyKey: (key) => set('geoJsonPropertyKey', key),
            autoFillAreaLocation: (locationFieldId, geoJsonPropertyKey) =>
                dispatch(
                    mapEditorActions.areaLocationAutoFill({
                        locationFieldId,
                        geoJsonPropertyKey,
                    }),
                ),
            setValueFieldId: (fieldId) =>
                dispatch(mapEditorActions.valueFieldIdChange(fieldId)),
            setColorRange: (colors) => set('colorRange', colors),
            addColor: () => dispatch(mapEditorActions.addColor()),
            removeColor: (index) =>
                dispatch(mapEditorActions.removeColor(index)),
            updateColor: (index, color) =>
                dispatch(mapEditorActions.updateColor({ index, color })),
            setShowLegend: (show) => set('showLegend', show),
            setSaveMapExtent: (save) => set('saveMapExtent', save),
            setDefaultZoom: (zoom) => set('defaultZoom', zoom),
            setDefaultCenterLat: (lat) => set('defaultCenterLat', lat),
            setDefaultCenterLon: (lon) => set('defaultCenterLon', lon),
            setMinBubbleSize: (size) => set('minBubbleSize', size),
            setMaxBubbleSize: (size) => set('maxBubbleSize', size),
            setSizeFieldId: (fieldId) => set('sizeFieldId', fieldId),
            setHeatmapConfig: (config) =>
                dispatch(mapEditorActions.heatmapConfigChange(config)),
            setHexbinConfig: (config) =>
                dispatch(mapEditorActions.hexbinConfigChange(config)),
            setTileBackground: (background) =>
                set('tileBackground', background),
            setDarkModeTileBackground: (background) =>
                set('darkModeTileBackground', background),
            setBackgroundColor: (color) => set('backgroundColor', color),
            setNoDataColor: (color) => set('noDataColor', color),
            setDataLayerOpacity: (opacity) => set('dataLayerOpacity', opacity),
            setColorOverride: (value, color) =>
                dispatch(
                    mapEditorActions.colorOverrideChange({ value, color }),
                ),
            setColorOverrides: (overrides) => set('colorOverrides', overrides),
            updateFieldConfig: (fieldId, config) =>
                dispatch(
                    mapEditorActions.fieldConfigUpdate({ fieldId, config }),
                ),
        }),
        [dispatch, set],
    );
};

type MapChartConfig = MapEditorActions & {
    chartType: ChartType.MAP;
    validConfig: MapChart & { saveMapExtent: boolean };
    defaultConfig: MapChart;
    isFieldVisible: (fieldId: string) => boolean;
    getFieldLabel: (fieldId: string) => string | undefined;
};

const defaultConfig: MapChart = {
    mapType: MapChartLocation.WORLD,
    locationType: MapChartType.SCATTER,
    colorRange: DEFAULT_MAP_COLORS,
};

/** Everything the map body reads, re-rendering on every edit; config panels select their own fields */
const useMapChartConfig = (): MapChartConfig => {
    const validConfig = useVisualizationInputSelector(selectMapValidConfig);
    const fieldConfig = useVisualizationSelector(
        (state) => selectMapEditor(state).fieldConfig,
    );
    const actions = useMapEditorActions();

    const isFieldVisible = useCallback(
        (fieldId: string) => fieldConfig[fieldId]?.visible !== false,
        [fieldConfig],
    );
    const getFieldLabel = useCallback(
        (fieldId: string) => fieldConfig[fieldId]?.label,
        [fieldConfig],
    );

    return useMemo(
        () => ({
            chartType: ChartType.MAP,
            validConfig,
            defaultConfig,
            ...actions,
            isFieldVisible,
            getFieldLabel,
        }),
        [validConfig, actions, isFieldVisible, getFieldLabel],
    );
};

export default useMapChartConfig;
