import {
    ChartType,
    MapChartLocation,
    MapChartType,
    type ItemsMap,
    type MapChart,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

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
    _itemsMap: ItemsMap | undefined,
): MapChartConfig => {
    const [mapType, setMapTypeState] = useState<MapChartLocation | undefined>(
        initialConfig?.mapType ?? MapChartLocation.WORLD,
    );
    const [customGeoJsonUrl, setCustomGeoJsonUrlState] = useState<
        string | undefined
    >(initialConfig?.customGeoJsonUrl);
    const [locationType, setLocationTypeState] = useState<
        MapChartType | undefined
    >(initialConfig?.locationType ?? MapChartType.LAT_LONG);
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
            locationType: MapChartType.LAT_LONG,
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
