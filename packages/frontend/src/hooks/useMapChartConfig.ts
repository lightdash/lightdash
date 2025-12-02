import {
    ChartType,
    MapChartLocation,
    MapChartType,
    MapTileBackground,
    type ItemsMap,
    type MapChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Default colors for the region color gradient (2 colors by default)
export const DEFAULT_MAP_COLORS = ['#228be6', '#fa5252']; // blue to red

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
    setTileBackground: (background: MapTileBackground | undefined) => void;
    setBackgroundColor: (color: string | undefined) => void;
};

const useMapChartConfig = (
    initialConfig: MapChart | undefined,
    itemsMap: ItemsMap | undefined,
): MapChartConfig => {
    const [mapType, setMapTypeState] = useState<MapChartLocation | undefined>(
        initialConfig?.mapType ?? MapChartLocation.WORLD,
    );
    const [customGeoJsonUrl, setCustomGeoJsonUrlState] = useState<
        string | undefined
    >(initialConfig?.customGeoJsonUrl);
    const [locationType, setLocationTypeState] = useState<
        MapChartType | undefined
    >(initialConfig?.locationType ?? MapChartType.SCATTER);
    const [latitudeFieldId, setLatitudeFieldIdState] = useState<
        string | undefined
    >(initialConfig?.latitudeFieldId);
    const [longitudeFieldId, setLongitudeFieldIdState] = useState<
        string | undefined
    >(initialConfig?.longitudeFieldId);
    const [locationFieldId, setLocationFieldIdState] = useState<
        string | undefined
    >(initialConfig?.locationFieldId);
    const [valueFieldId, setValueFieldIdState] = useState<string | undefined>(
        initialConfig?.valueFieldId,
    );
    const [colorRange, setColorRangeState] = useState<string[]>(
        initialConfig?.colorRange ?? DEFAULT_MAP_COLORS,
    );
    const [showLegend, setShowLegendState] = useState<boolean>(
        initialConfig?.showLegend ?? false,
    );
    // UI-only state: controls whether we track map extent changes
    // When true, zoom/center values are captured as user pans/zooms
    // Default to true so map extent is saved by default
    const [saveMapExtent, setSaveMapExtentState] = useState<boolean>(true);
    const [defaultZoom, setDefaultZoomState] = useState<number | undefined>(
        initialConfig?.defaultZoom,
    );
    const [defaultCenterLat, setDefaultCenterLatState] = useState<
        number | undefined
    >(initialConfig?.defaultCenterLat);
    const [defaultCenterLon, setDefaultCenterLonState] = useState<
        number | undefined
    >(initialConfig?.defaultCenterLon);
    const [minBubbleSize, setMinBubbleSizeState] = useState<number | undefined>(
        initialConfig?.minBubbleSize,
    );
    const [maxBubbleSize, setMaxBubbleSizeState] = useState<number | undefined>(
        initialConfig?.maxBubbleSize,
    );
    const [sizeFieldId, setSizeFieldIdState] = useState<string | undefined>(
        initialConfig?.sizeFieldId,
    );
    const [tileBackground, setTileBackgroundState] = useState<
        MapTileBackground | undefined
    >(initialConfig?.tileBackground ?? MapTileBackground.LIGHT);
    const [backgroundColor, setBackgroundColorState] = useState<
        string | undefined
    >(initialConfig?.backgroundColor);

    // Auto-fill latitude/longitude fields when switching to scatter mode
    useEffect(() => {
        if (
            locationType === MapChartType.SCATTER &&
            itemsMap &&
            (!latitudeFieldId || !longitudeFieldId)
        ) {
            const items = Object.entries(itemsMap);

            // Try to find latitude field if not set
            if (!latitudeFieldId) {
                const latField = items.find(([_, item]) => {
                    const name = (
                        'label' in item
                            ? item.label
                            : 'displayName' in item
                            ? item.displayName
                            : 'name' in item
                            ? item.name
                            : ''
                    ).toLowerCase();
                    return name === 'latitude' || name === 'lat';
                });
                if (latField) {
                    setLatitudeFieldIdState(latField[0]);
                }
            }

            // Try to find longitude field if not set
            if (!longitudeFieldId) {
                const lonField = items.find(([_, item]) => {
                    const name = (
                        'label' in item
                            ? item.label
                            : 'displayName' in item
                            ? item.displayName
                            : 'name' in item
                            ? item.name
                            : ''
                    ).toLowerCase();
                    return (
                        name === 'longitude' ||
                        name === 'lon' ||
                        name === 'long'
                    );
                });
                if (lonField) {
                    setLongitudeFieldIdState(lonField[0]);
                }
            }
        }
    }, [locationType, itemsMap, latitudeFieldId, longitudeFieldId]);

    const validConfig: MapChart & { saveMapExtent: boolean } = useMemo(() => {
        return {
            mapType,
            customGeoJsonUrl,
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
            colorRange,
            showLegend,
            // saveMapExtent is UI-only, not persisted to backend
            saveMapExtent,
            defaultZoom,
            defaultCenterLat,
            defaultCenterLon,
            minBubbleSize,
            maxBubbleSize,
            sizeFieldId,
            tileBackground,
            backgroundColor,
        };
    }, [
        mapType,
        customGeoJsonUrl,
        locationType,
        latitudeFieldId,
        longitudeFieldId,
        locationFieldId,
        valueFieldId,
        colorRange,
        showLegend,
        saveMapExtent,
        defaultZoom,
        defaultCenterLat,
        defaultCenterLon,
        minBubbleSize,
        maxBubbleSize,
        sizeFieldId,
        tileBackground,
        backgroundColor,
    ]);

    const defaultConfig: MapChart = useMemo(() => {
        return {
            mapType: MapChartLocation.WORLD,
            locationType: MapChartType.SCATTER,
            colorRange: DEFAULT_MAP_COLORS,
        };
    }, []);

    const setMapType = useCallback(
        (newMapType: MapChartLocation | undefined) => {
            setMapTypeState(newMapType);
        },
        [],
    );

    const setCustomGeoJsonUrl = useCallback((url: string | undefined) => {
        setCustomGeoJsonUrlState(url);
    }, []);

    const setLocationType = useCallback(
        (newLocationType: MapChartType | undefined) => {
            setLocationTypeState(newLocationType);
        },
        [],
    );

    const setLatitudeFieldId = useCallback((fieldId: string | undefined) => {
        setLatitudeFieldIdState(fieldId);
    }, []);

    const setLongitudeFieldId = useCallback((fieldId: string | undefined) => {
        setLongitudeFieldIdState(fieldId);
    }, []);

    const setLocationFieldId = useCallback((fieldId: string | undefined) => {
        setLocationFieldIdState(fieldId);
    }, []);

    const setValueFieldId = useCallback((fieldId: string | undefined) => {
        setValueFieldIdState(fieldId);
    }, []);

    const setColorRange = useCallback((colors: string[]) => {
        setColorRangeState(colors);
    }, []);

    const addColor = useCallback(() => {
        setColorRangeState((prev) => {
            if (prev.length >= 5) return prev;
            // Add a color in the middle (default to a yellow-ish color)
            const newColors = [...prev];
            newColors.splice(prev.length - 1, 0, '#fab005');
            return newColors;
        });
    }, []);

    const removeColor = useCallback((index: number) => {
        setColorRangeState((prev) => {
            if (prev.length <= 2) return prev;
            return prev.filter((_, i) => i !== index);
        });
    }, []);

    const updateColor = useCallback((index: number, color: string) => {
        setColorRangeState((prev) => {
            const newColors = [...prev];
            newColors[index] = color;
            return newColors;
        });
    }, []);

    const setShowLegend = useCallback((show: boolean) => {
        setShowLegendState(show);
    }, []);

    const setSaveMapExtent = useCallback((save: boolean) => {
        setSaveMapExtentState(save);
    }, []);

    const setDefaultZoom = useCallback((zoom: number | undefined) => {
        setDefaultZoomState(zoom);
    }, []);

    const setDefaultCenterLat = useCallback((lat: number | undefined) => {
        setDefaultCenterLatState(lat);
    }, []);

    const setDefaultCenterLon = useCallback((lon: number | undefined) => {
        setDefaultCenterLonState(lon);
    }, []);

    const setMinBubbleSize = useCallback((size: number | undefined) => {
        setMinBubbleSizeState(size);
    }, []);

    const setMaxBubbleSize = useCallback((size: number | undefined) => {
        setMaxBubbleSizeState(size);
    }, []);

    const setSizeFieldId = useCallback((fieldId: string | undefined) => {
        setSizeFieldIdState(fieldId);
    }, []);

    const setTileBackground = useCallback(
        (background: MapTileBackground | undefined) => {
            setTileBackgroundState(background);
        },
        [],
    );

    const setBackgroundColor = useCallback((color: string | undefined) => {
        setBackgroundColorState(color);
    }, []);

    return {
        chartType: ChartType.MAP,
        validConfig,
        defaultConfig,
        setMapType,
        setCustomGeoJsonUrl,
        setLocationType,
        setLatitudeFieldId,
        setLongitudeFieldId,
        setLocationFieldId,
        setValueFieldId,
        setColorRange,
        addColor,
        removeColor,
        updateColor,
        setShowLegend,
        setSaveMapExtent,
        setDefaultZoom,
        setDefaultCenterLat,
        setDefaultCenterLon,
        setMinBubbleSize,
        setMaxBubbleSize,
        setSizeFieldId,
        setTileBackground,
        setBackgroundColor,
    };
};

export default useMapChartConfig;
