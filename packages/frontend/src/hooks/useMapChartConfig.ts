import {
    ChartType,
    MapChartLocation,
    MapChartType,
    type ItemsMap,
    type MapTileBackground,
    type MapChart,
    type MapFieldConfig,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import {
    buildMapEditorState,
    mapEditorActions,
    selectMapEditor,
    useEditorFieldSetter,
    useEditorState,
    useVisualizationDispatch,
    type MapEditorState,
} from '../features/visualization/store';
import { DEFAULT_MAP_COLORS } from '../features/visualization/store/mapEditorSlice';

export { DEFAULT_MAP_COLORS };

type MapChartConfig = {
    chartType: ChartType.MAP;
    validConfig: MapChart & { saveMapExtent: boolean };
    defaultConfig: MapChart;
    setMapType: (mapType: MapChartLocation | undefined) => void;
    setCustomGeoJsonUrl: (url: string | undefined) => void;
    setLocationType: (locationType: MapChartType | undefined) => void;
    setLatitudeFieldId: (fieldId: string | undefined) => void;
    setLongitudeFieldId: (fieldId: string | undefined) => void;
    setLocationFieldId: (fieldId: string | undefined) => void;
    setGeoJsonPropertyKey: (key: string | undefined) => void;
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
    setHeatmapConfig: (
        config:
            | { radius?: number; blur?: number; opacity?: number }
            | undefined,
    ) => void;
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
    // Categorical color overrides (for string fields)
    setColorOverride: (value: string, color: string) => void;
    setColorOverrides: (overrides: Record<string, string>) => void;
    // Field configuration methods
    updateFieldConfig: (
        fieldId: string,
        config: Partial<MapFieldConfig>,
    ) => void;
    isFieldVisible: (fieldId: string) => boolean;
    getFieldLabel: (fieldId: string) => string | undefined;
};

const getItemName = (item: ItemsMap[string]) =>
    'label' in item
        ? item.label
        : 'displayName' in item
          ? item.displayName
          : 'name' in item
            ? item.name
            : '';

const useMapChartConfig = (
    initialConfig: MapChart | undefined,
    itemsMap: ItemsMap | undefined,
): MapChartConfig => {
    const state = useEditorState(selectMapEditor, mapEditorActions, () =>
        buildMapEditorState(initialConfig),
    );
    const { locationType, latitudeFieldId, longitudeFieldId, fieldConfig } =
        state;
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<MapEditorState>(
        selectMapEditor,
        mapEditorActions.set,
    );

    // Auto-fill latitude/longitude fields when switching to scatter mode
    useEffect(() => {
        if (
            locationType === MapChartType.SCATTER &&
            itemsMap &&
            (!latitudeFieldId || !longitudeFieldId)
        ) {
            const items = Object.entries(itemsMap);

            if (!latitudeFieldId) {
                const latField = items.find(([_, item]) => {
                    const name = getItemName(item).toLowerCase();
                    return name === 'latitude' || name === 'lat';
                });
                if (latField) {
                    set('latitudeFieldId', latField[0]);
                }
            }

            if (!longitudeFieldId) {
                const lonField = items.find(([_, item]) => {
                    const name = getItemName(item).toLowerCase();
                    return (
                        name === 'longitude' ||
                        name === 'lon' ||
                        name === 'long'
                    );
                });
                if (lonField) {
                    set('longitudeFieldId', lonField[0]);
                }
            }
        }
    }, [locationType, itemsMap, latitudeFieldId, longitudeFieldId, set]);

    const validConfig: MapChart & { saveMapExtent: boolean } = useMemo(
        () => ({ ...state }),
        [state],
    );

    const defaultConfig: MapChart = useMemo(() => {
        return {
            mapType: MapChartLocation.WORLD,
            locationType: MapChartType.SCATTER,
            colorRange: DEFAULT_MAP_COLORS,
        };
    }, []);

    const setters = useMemo(
        () => ({
            setMapType: (mapType: MapChartLocation | undefined) =>
                set('mapType', mapType),
            setCustomGeoJsonUrl: (url: string | undefined) =>
                set('customGeoJsonUrl', url),
            setLocationType: (value: MapChartType | undefined) =>
                dispatch(mapEditorActions.locationTypeChange(value)),
            setLatitudeFieldId: (fieldId: string | undefined) =>
                set('latitudeFieldId', fieldId),
            setLongitudeFieldId: (fieldId: string | undefined) =>
                set('longitudeFieldId', fieldId),
            setLocationFieldId: (fieldId: string | undefined) =>
                set('locationFieldId', fieldId),
            setGeoJsonPropertyKey: (key: string | undefined) =>
                set('geoJsonPropertyKey', key),
            setValueFieldId: (fieldId: string | undefined) =>
                dispatch(mapEditorActions.valueFieldIdChange(fieldId)),
            setColorRange: (colors: string[]) => set('colorRange', colors),
            addColor: () => dispatch(mapEditorActions.addColor()),
            removeColor: (index: number) =>
                dispatch(mapEditorActions.removeColor(index)),
            updateColor: (index: number, color: string) =>
                dispatch(mapEditorActions.updateColor({ index, color })),
            setShowLegend: (show: boolean) => set('showLegend', show),
            setSaveMapExtent: (save: boolean) => set('saveMapExtent', save),
            setDefaultZoom: (zoom: number | undefined) =>
                set('defaultZoom', zoom),
            setDefaultCenterLat: (lat: number | undefined) =>
                set('defaultCenterLat', lat),
            setDefaultCenterLon: (lon: number | undefined) =>
                set('defaultCenterLon', lon),
            setMinBubbleSize: (size: number | undefined) =>
                set('minBubbleSize', size),
            setMaxBubbleSize: (size: number | undefined) =>
                set('maxBubbleSize', size),
            setSizeFieldId: (fieldId: string | undefined) =>
                set('sizeFieldId', fieldId),
            setHeatmapConfig: (
                config:
                    | { radius?: number; blur?: number; opacity?: number }
                    | undefined,
            ) => dispatch(mapEditorActions.heatmapConfigChange(config)),
            setHexbinConfig: (
                config: NonNullable<MapChart['hexbinConfig']> | undefined,
            ) => dispatch(mapEditorActions.hexbinConfigChange(config)),
            setTileBackground: (background: MapTileBackground | undefined) =>
                set('tileBackground', background),
            setDarkModeTileBackground: (
                background: MapTileBackground | undefined,
            ) => set('darkModeTileBackground', background),
            setBackgroundColor: (color: string | undefined) =>
                set('backgroundColor', color),
            setNoDataColor: (color: string | undefined) =>
                set('noDataColor', color),
            setDataLayerOpacity: (opacity: number | undefined) =>
                set('dataLayerOpacity', opacity),
            setColorOverride: (value: string, color: string) =>
                dispatch(
                    mapEditorActions.colorOverrideChange({ value, color }),
                ),
            setColorOverrides: (overrides: Record<string, string>) =>
                set('colorOverrides', overrides),
            updateFieldConfig: (
                fieldId: string,
                config: Partial<MapFieldConfig>,
            ) =>
                dispatch(
                    mapEditorActions.fieldConfigUpdate({ fieldId, config }),
                ),
        }),
        [dispatch, set],
    );

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
            ...setters,
            isFieldVisible,
            getFieldLabel,
        }),
        [validConfig, defaultConfig, setters, isFieldVisible, getFieldLabel],
    );
};

export default useMapChartConfig;
