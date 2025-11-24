import {
    ChartType,
    MapChartLocationType,
    MapChartMapType,
    type ItemsMap,
    type MapChart,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

type MapChartConfig = {
    chartType: ChartType.MAP;
    validConfig: MapChart;
    defaultConfig: MapChart;
    setMapType: (mapType: MapChartMapType | undefined) => void;
    setLocationType: (locationType: MapChartLocationType | undefined) => void;
    setLatitudeFieldId: (fieldId: string | undefined) => void;
    setLongitudeFieldId: (fieldId: string | undefined) => void;
    setLocationFieldId: (fieldId: string | undefined) => void;
    setValueFieldId: (fieldId: string | undefined) => void;
};

const useMapChartConfig = (
    initialConfig: MapChart | undefined,
    _itemsMap: ItemsMap | undefined,
): MapChartConfig => {
    const [mapType, setMapTypeState] = useState<MapChartMapType | undefined>(
        initialConfig?.mapType ?? MapChartMapType.WORLD,
    );
    const [locationType, setLocationTypeState] = useState<
        MapChartLocationType | undefined
    >(initialConfig?.locationType ?? MapChartLocationType.LAT_LONG);
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
    const [showLegend] = useState<boolean>(initialConfig?.showLegend ?? false);

    const validConfig: MapChart = useMemo(() => {
        return {
            mapType,
            locationType,
            latitudeFieldId,
            longitudeFieldId,
            locationFieldId,
            valueFieldId,
            showLegend,
        };
    }, [
        mapType,
        locationType,
        latitudeFieldId,
        longitudeFieldId,
        locationFieldId,
        valueFieldId,
        showLegend,
    ]);

    const defaultConfig: MapChart = useMemo(() => {
        return {
            mapType: MapChartMapType.WORLD,
            locationType: MapChartLocationType.LAT_LONG,
            showLegend: false,
        };
    }, []);

    const setMapType = useCallback(
        (newMapType: MapChartMapType | undefined) => {
            setMapTypeState(newMapType);
        },
        [],
    );

    const setLocationType = useCallback(
        (newLocationType: MapChartLocationType | undefined) => {
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

    return {
        chartType: ChartType.MAP,
        validConfig,
        defaultConfig,
        setMapType,
        setLocationType,
        setLatitudeFieldId,
        setLongitudeFieldId,
        setLocationFieldId,
        setValueFieldId,
    };
};

export default useMapChartConfig;
