import {
    ChartType,
    MapChartLocation,
    MapChartType,
    type ItemsMap,
    type MapChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Default colors for the region color gradient
export const DEFAULT_MAP_COLORS = {
    low: '#228be6', // blue
    mid: '#fab005', // yellow
    high: '#fa5252', // red
};

type MapChartConfig = {
    chartType: ChartType.MAP;
    validConfig: MapChart;
    defaultConfig: MapChart;
    setMapType: (mapType: MapChartLocation | undefined) => void;
    setCustomGeoJsonUrl: (url: string | undefined) => void;
    setLocationType: (locationType: MapChartType | undefined) => void;
    setLatitudeFieldId: (fieldId: string | undefined) => void;
    setLongitudeFieldId: (fieldId: string | undefined) => void;
    setLocationFieldId: (fieldId: string | undefined) => void;
    setValueFieldId: (fieldId: string | undefined) => void;
    setColorRangeLow: (color: string | undefined) => void;
    setColorRangeMid: (color: string | undefined) => void;
    setColorRangeHigh: (color: string | undefined) => void;
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
    const [colorRangeLow, setColorRangeLowState] = useState<string | undefined>(
        initialConfig?.colorRangeLow,
    );
    const [colorRangeMid, setColorRangeMidState] = useState<string | undefined>(
        initialConfig?.colorRangeMid,
    );
    const [colorRangeHigh, setColorRangeHighState] = useState<
        string | undefined
    >(initialConfig?.colorRangeHigh);

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

    const validConfig: MapChart = useMemo(() => {
        return {
            mapType,
            customGeoJsonUrl,
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
            colorRangeLow,
            colorRangeMid,
            colorRangeHigh,
        };
    }, [
        mapType,
        customGeoJsonUrl,
        locationType,
        latitudeFieldId,
        longitudeFieldId,
        locationFieldId,
        valueFieldId,
        colorRangeLow,
        colorRangeMid,
        colorRangeHigh,
    ]);

    const defaultConfig: MapChart = useMemo(() => {
        return {
            mapType: MapChartLocation.WORLD,
            locationType: MapChartType.SCATTER,
            colorRangeLow: DEFAULT_MAP_COLORS.low,
            colorRangeMid: DEFAULT_MAP_COLORS.mid,
            colorRangeHigh: DEFAULT_MAP_COLORS.high,
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

    const setColorRangeLow = useCallback((color: string | undefined) => {
        setColorRangeLowState(color);
    }, []);

    const setColorRangeMid = useCallback((color: string | undefined) => {
        setColorRangeMidState(color);
    }, []);

    const setColorRangeHigh = useCallback((color: string | undefined) => {
        setColorRangeHighState(color);
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
        setColorRangeLow,
        setColorRangeMid,
        setColorRangeHigh,
    };
};

export default useMapChartConfig;
