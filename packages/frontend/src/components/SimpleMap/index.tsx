import { MapChartType } from '@lightdash/common';
import { IconMap } from '@tabler/icons-react';
import { scaleSqrt } from 'd3-scale';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type RefObject,
} from 'react';
import {
    CircleMarker,
    GeoJSON,
    MapContainer,
    Popup,
    TileLayer,
    useMap,
} from 'react-leaflet';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';
import useLeafletMapConfig from '../../hooks/leaflet/useLeafletMapConfig';
import { isMapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import HeatmapLayer from './HeatmapLayer';
import MapLegend from './MapLegend';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

// Component to capture the Leaflet map instance and store it in the ref
const MapRefUpdater: FC<{ mapRef: RefObject<L.Map | null> }> = ({ mapRef }) => {
    const map = useMap();
    useEffect(() => {
        mapRef.current = map;
        return () => {
            mapRef.current = null;
        };
    }, [map, mapRef]);
    return null;
};

// Component to track map extent when saveMapExtent is enabled
const MapExtentTracker: FC<{
    saveMapExtent: boolean;
    onExtentChange: (zoom: number, lat: number, lon: number) => void;
}> = ({ saveMapExtent, onExtentChange }) => {
    const map = useMap();

    useEffect(() => {
        if (!saveMapExtent) return;

        const handleMoveEnd = () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            onExtentChange(zoom, center.lat, center.lng);
        };

        // Capture initial extent
        handleMoveEnd();

        // Listen for map movements
        map.on('moveend', handleMoveEnd);
        map.on('zoomend', handleMoveEnd);

        return () => {
            map.off('moveend', handleMoveEnd);
            map.off('zoomend', handleMoveEnd);
        };
    }, [map, saveMapExtent, onExtentChange]);

    return null;
};

const EmptyChart: FC<{ locationType?: MapChartType }> = ({ locationType }) => {
    const description =
        locationType === MapChartType.AREA
            ? 'Query metrics and dimensions with region data.'
            : 'Query metrics and dimensions with latitude/longitude data.';

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title="No data available"
                description={description}
                icon={IconMap}
            />
        </div>
    );
};

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </div>
);

type SimpleMapProps = {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

// Helper to calculate color based on value range
const getColorForValue = (
    value: number,
    min: number,
    max: number,
    colors: string[],
): string => {
    if (max === min) return colors[Math.floor(colors.length / 2)]; // middle color
    const ratio = (value - min) / (max - min);
    const index = Math.min(
        Math.floor(ratio * colors.length),
        colors.length - 1,
    );
    return colors[index];
};

const SimpleMap: FC<SimpleMapProps> = memo((props) => {
    const { isLoading, visualizationConfig, resultsData, leafletMapRef } =
        useVisualizationContext();
    const mapConfig = useLeafletMapConfig({
        isInDashboard: props.isInDashboard,
    });

    const [geoJsonData, setGeoJsonData] =
        useState<GeoJSON.FeatureCollection | null>(null);

    // Get extent setters from visualization config
    const extentSetters = useMemo(() => {
        if (!isMapVisualizationConfig(visualizationConfig)) return null;
        return {
            setDefaultZoom: visualizationConfig.chartConfig.setDefaultZoom,
            setDefaultCenterLat:
                visualizationConfig.chartConfig.setDefaultCenterLat,
            setDefaultCenterLon:
                visualizationConfig.chartConfig.setDefaultCenterLon,
            saveMapExtent:
                visualizationConfig.chartConfig.validConfig.saveMapExtent,
        };
    }, [visualizationConfig]);

    // Handler to update extent when map moves
    const handleExtentChange = useCallback(
        (zoom: number, lat: number, lon: number) => {
            if (extentSetters) {
                extentSetters.setDefaultZoom(zoom);
                extentSetters.setDefaultCenterLat(lat);
                extentSetters.setDefaultCenterLon(lon);
            }
        },
        [extentSetters],
    );

    // Load all data when component mounts
    useEffect(() => {
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    // Load GeoJSON data for choropleth maps
    useEffect(() => {
        if (!mapConfig?.geoJsonUrl || mapConfig.isLatLong) {
            setGeoJsonData(null);
            return;
        }

        const loadGeoJson = async () => {
            try {
                const response = await fetch(mapConfig.geoJsonUrl!);
                const data = await response.json();

                // Convert TopoJSON to GeoJSON if needed
                if (data.type === 'Topology' && data.objects) {
                    const topology = data as Topology;
                    const objectKey = Object.keys(topology.objects)[0];
                    const geoJson = topojson.feature(
                        topology,
                        topology.objects[objectKey],
                    ) as GeoJSON.FeatureCollection;

                    // Ensure each feature has a 'name' property for region matching
                    if (geoJson.features) {
                        geoJson.features.forEach((feature) => {
                            if (
                                feature.properties &&
                                !feature.properties.name
                            ) {
                                const propKeys = Object.keys(
                                    feature.properties,
                                );
                                if (propKeys.length > 0) {
                                    feature.properties.name = String(
                                        feature.properties[propKeys[0]],
                                    );
                                }
                            }
                        });
                    }
                    setGeoJsonData(geoJson);
                } else if (data.type === 'FeatureCollection') {
                    // Already GeoJSON - create a clean copy without crs property
                    // and ensure each feature has required fields
                    const validFeatures = (data.features || [])
                        .filter((feature: any) => {
                            // Check that feature has valid geometry
                            if (!feature || !feature.geometry) return false;
                            if (!feature.geometry.type) return false;
                            if (!feature.geometry.coordinates) return false;
                            return true;
                        })
                        .map((feature: any) => ({
                            // Ensure each feature has type: "Feature" (required by GeoJSON spec)
                            type: 'Feature' as const,
                            geometry: feature.geometry,
                            properties: feature.properties || {},
                        }));

                    const geoJson: GeoJSON.FeatureCollection = {
                        type: 'FeatureCollection',
                        features: validFeatures,
                    };

                    // Ensure each feature has a 'name' property for region matching
                    geoJson.features.forEach((feature) => {
                        if (feature.properties && !feature.properties.name) {
                            const propKeys = Object.keys(feature.properties);
                            if (propKeys.length > 0) {
                                feature.properties.name = String(
                                    feature.properties[propKeys[0]],
                                );
                            }
                        }
                    });

                    setGeoJsonData(geoJson);
                } else {
                    console.error('Unknown data format:', data.type);
                }
            } catch (error) {
                console.error('Failed to load GeoJSON:', error);
            }
        };

        void loadGeoJson();
    }, [mapConfig?.geoJsonUrl, mapConfig?.isLatLong]);

    // Get location type from visualization config
    const locationType = useMemo(
        () =>
            isMapVisualizationConfig(visualizationConfig)
                ? visualizationConfig.chartConfig.validConfig.locationType
                : undefined,
        [visualizationConfig],
    );

    // Memoize scatter/lat-long mode calculations
    const scatterData = useMemo(
        () => mapConfig?.scatterData || [],
        [mapConfig?.scatterData],
    );

    const scatterValueRange = useMemo(() => {
        const values = scatterData.map((d) => d.value);
        return {
            min: values.length > 0 ? Math.min(...values, 0) : 0,
            max: values.length > 0 ? Math.max(...values, 1) : 1,
        };
    }, [scatterData]);

    const sizeScale = useMemo(() => {
        if (!mapConfig) return null;
        const sizeMin = mapConfig.sizeRange?.min ?? scatterValueRange.min;
        const sizeMax = mapConfig.sizeRange?.max ?? scatterValueRange.max;
        return scaleSqrt()
            .domain([sizeMin, sizeMax])
            .range([mapConfig.minBubbleSize, mapConfig.maxBubbleSize]);
    }, [mapConfig, scatterValueRange.min, scatterValueRange.max]);

    const heatmapPoints = useMemo((): [number, number, number][] => {
        const { min, max } = scatterValueRange;
        return scatterData.map((point) => {
            const intensity =
                max === min ? 0.5 : (point.value - min) / (max - min);
            return [point.lat, point.lon, intensity];
        });
    }, [scatterData, scatterValueRange]);

    const heatmapGradient = useMemo((): Record<number, string> => {
        if (!mapConfig) return {};
        const gradient: Record<number, string> = {};
        mapConfig.colors.scale.forEach((color, index) => {
            const position = index / (mapConfig.colors.scale.length - 1);
            gradient[position] = color;
        });
        return gradient;
    }, [mapConfig]);

    const isHeatmap = mapConfig?.locationType === MapChartType.HEATMAP;

    // Memoize choropleth/area mode calculations
    const regionData = useMemo(
        () => mapConfig?.regionData || [],
        [mapConfig?.regionData],
    );

    const regionDataMap = useMemo(() => {
        const dataMap = new Map<string, number>();
        regionData.forEach((d) => {
            dataMap.set(d.name.toLowerCase(), d.value);
        });
        return dataMap;
    }, [regionData]);

    const regionValueRange = useMemo(() => {
        const values = regionData.map((d) => d.value);
        return {
            min: values.length > 0 ? Math.min(...values) : 0,
            max: values.length > 0 ? Math.max(...values) : 1,
        };
    }, [regionData]);

    const choroplethStyle = useCallback(
        (feature: any): L.PathOptions => {
            if (!feature?.properties || !mapConfig) {
                return {
                    fillColor: '#f3f3f3',
                    weight: 0.5,
                    opacity: 1,
                    color: '#999',
                    fillOpacity: 0.5,
                };
            }

            const name =
                feature.properties.name?.toLowerCase() ||
                feature.properties.NAME?.toLowerCase() ||
                '';
            const value = regionDataMap.get(name);

            if (value !== undefined) {
                const color = getColorForValue(
                    value,
                    regionValueRange.min,
                    regionValueRange.max,
                    mapConfig.colors.scale,
                );
                return {
                    fillColor: color,
                    weight: 1,
                    opacity: 1,
                    color: '#666',
                    fillOpacity: 0.7,
                };
            }

            return {
                fillColor: '#f3f3f3',
                weight: 0.5,
                opacity: 1,
                color: '#999',
                fillOpacity: 0.5,
            };
        },
        [regionDataMap, regionValueRange, mapConfig],
    );

    const onEachFeature = useCallback(
        (feature: GeoJSON.Feature, layer: L.Layer) => {
            const name =
                feature.properties?.name ||
                feature.properties?.NAME ||
                'Unknown';
            const value = regionDataMap.get(name.toLowerCase());

            if (layer instanceof L.Path) {
                layer.on({
                    mouseover: () => {
                        layer.setStyle({
                            weight: 2,
                            fillOpacity: 0.9,
                        });
                    },
                    mouseout: () => {
                        layer.setStyle({
                            weight: 1,
                            fillOpacity: 0.7,
                        });
                    },
                });
            }

            const valueLabel = mapConfig?.valueFieldLabel || 'Value';
            const popupContent = `
                <div>
                    <strong>${name}</strong><br/>
                    ${valueLabel}: ${value !== undefined ? value : 'No data'}
                </div>
            `;

            (layer as L.Path).bindPopup(popupContent);
        },
        [regionDataMap, mapConfig?.valueFieldLabel],
    );

    if (isLoading) {
        return <LoadingChart />;
    }

    if (!mapConfig) {
        return <EmptyChart locationType={locationType} />;
    }

    // Scatter/Heatmap mode - render markers or heatmap (show map even without data)
    if (mapConfig.isLatLong) {
        return (
            <div
                className={`${classes.container} ${props.className ?? ''}`}
                data-should-expand={props.$shouldExpand}
                data-testid={props['data-testid']}
                style={
                    mapConfig.backgroundColor
                        ? ({
                              '--map-background-color':
                                  mapConfig.backgroundColor,
                          } as React.CSSProperties)
                        : undefined
                }
            >
                <MapContainer
                    center={mapConfig.center}
                    zoom={mapConfig.zoom}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom
                >
                    <MapRefUpdater mapRef={leafletMapRef} />
                    <MapExtentTracker
                        saveMapExtent={extentSetters?.saveMapExtent ?? false}
                        onExtentChange={handleExtentChange}
                    />
                    {mapConfig.tile.url && (
                        <TileLayer
                            attribution={mapConfig.tile.attribution}
                            url={mapConfig.tile.url}
                        />
                    )}
                    {isHeatmap ? (
                        <HeatmapLayer
                            points={heatmapPoints}
                            options={{
                                gradient: heatmapGradient,
                                radius: 25,
                                blur: 15,
                                minOpacity: 0.6,
                            }}
                        />
                    ) : (
                        sizeScale &&
                        scatterData.map((point, idx) => {
                            const radius = sizeScale(point.sizeValue);
                            const color = getColorForValue(
                                point.value,
                                scatterValueRange.min,
                                scatterValueRange.max,
                                mapConfig.colors.scale,
                            );
                            return (
                                <CircleMarker
                                    key={idx}
                                    center={[point.lat, point.lon]}
                                    radius={radius}
                                    pathOptions={{
                                        fillColor: color,
                                        fillOpacity: 0.7,
                                        color: '#fff',
                                        weight: 1,
                                    }}
                                >
                                    <Popup>
                                        <div>
                                            <strong>
                                                {mapConfig.valueFieldLabel ||
                                                    'Value'}
                                                :
                                            </strong>{' '}
                                            {point.value}
                                            <br />
                                            <span
                                                style={{
                                                    fontSize: '0.85em',
                                                    opacity: 0.7,
                                                }}
                                            >
                                                Lat: {point.lat.toFixed(4)},
                                                Lon: {point.lon.toFixed(4)}
                                            </span>
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            );
                        })
                    )}
                </MapContainer>
                {mapConfig.showLegend && mapConfig.valueRange && (
                    <MapLegend
                        colors={mapConfig.colors.scale}
                        min={mapConfig.valueRange.min}
                        max={mapConfig.valueRange.max}
                    />
                )}
            </div>
        );
    }

    // Choropleth/Area mode - render map with optional GeoJSON layer
    if (!mapConfig.isLatLong) {
        return (
            <div
                className={`${classes.container} ${props.className ?? ''}`}
                data-should-expand={props.$shouldExpand}
                data-testid={props['data-testid']}
                style={
                    mapConfig.backgroundColor
                        ? ({
                              '--map-background-color':
                                  mapConfig.backgroundColor,
                          } as React.CSSProperties)
                        : undefined
                }
            >
                <MapContainer
                    center={mapConfig.center}
                    zoom={mapConfig.zoom}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom
                >
                    <MapRefUpdater mapRef={leafletMapRef} />
                    <MapExtentTracker
                        saveMapExtent={extentSetters?.saveMapExtent ?? false}
                        onExtentChange={handleExtentChange}
                    />
                    {mapConfig.tile.url && (
                        <TileLayer
                            attribution={mapConfig.tile.attribution}
                            url={mapConfig.tile.url}
                        />
                    )}
                    {geoJsonData?.features &&
                        geoJsonData.features.length > 0 && (
                            <GeoJSON
                                key={`geojson-${mapConfig.geoJsonUrl}-${geoJsonData.features.length}`}
                                data={geoJsonData}
                                style={choroplethStyle}
                                onEachFeature={onEachFeature}
                            />
                        )}
                </MapContainer>
                {mapConfig.showLegend && mapConfig.valueRange && (
                    <MapLegend
                        colors={mapConfig.colors.scale}
                        min={mapConfig.valueRange.min}
                        max={mapConfig.valueRange.max}
                    />
                )}
            </div>
        );
    }

    return <EmptyChart locationType={locationType} />;
});

export default SimpleMap;
