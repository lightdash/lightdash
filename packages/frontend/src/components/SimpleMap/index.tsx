import { MapChartType } from '@lightdash/common';
import { Box, Divider, Text, UnstyledButton } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconMap } from '@tabler/icons-react';
import { scaleSqrt } from 'd3-scale';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { renderToString } from 'react-dom/server';
import {
    CircleMarker,
    GeoJSON,
    MapContainer,
    Popup,
    TileLayer,
    Tooltip,
    useMap,
} from 'react-leaflet';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';
import useLeafletMapConfig, {
    type ScatterPoint,
} from '../../hooks/leaflet/useLeafletMapConfig';
import useToaster from '../../hooks/toaster/useToaster';
import { isMapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LoadingChart from '../common/LoadingChart';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import HeatmapLayer from './HeatmapLayer';
import MapLegend from './MapLegend';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

// Shared tooltip content component
type MapTooltipContentProps = {
    label: string;
    value: string | number;
    lat?: number;
    lon?: number;
};

const MapTooltipContent: FC<MapTooltipContentProps> = ({
    label,
    value,
    lat,
    lon,
}) => (
    <Box>
        <Text size="sm">
            <strong>{label}:</strong> {value}
        </Text>
        {lat !== undefined && lon !== undefined && (
            <Text size="xs" c="dimmed" mt="sm">
                Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
            </Text>
        )}
    </Box>
);

// Shared popup content component
type MapPopupContentProps = {
    label: string;
    value: string | number;
    lat?: number;
    lon?: number;
    onCopy?: () => void;
};

const MapPopupContent: FC<MapPopupContentProps> = ({
    label,
    value,
    lat,
    lon,
    onCopy,
}) => (
    // Force light mode colors since Leaflet popups always have white background
    <Box mt="xl" c="dark.7">
        <Text size="sm">
            <strong>{label}:</strong> {value}
        </Text>
        {lat !== undefined && lon !== undefined && (
            <Text size="xs" c="gray.6" mt="sm" mb="md">
                Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
            </Text>
        )}
        <Divider my="xs" c="gray.3" />
        <UnstyledButton
            onClick={onCopy}
            data-copy-value={value}
            className={classes.popupActionButton}
        >
            <MantineIcon icon={IconCopy} />
            <Text size="sm">Copy value</Text>
        </UnstyledButton>
    </Box>
);

// MapMarker component for scatter points with tooltip/popup behavior
type MapMarkerProps = {
    point: ScatterPoint;
    radius: number;
    color: string;
    valueFieldLabel: string;
};

const MapMarker: FC<MapMarkerProps> = ({
    point,
    radius,
    color,
    valueFieldLabel,
}) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();

    const handleCopy = useCallback(() => {
        clipboard.copy(String(point.displayValue));
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, point.displayValue, showToastSuccess]);

    return (
        <CircleMarker
            center={[point.lat, point.lon]}
            radius={radius}
            pathOptions={{
                fillColor: color,
                color: '#fff',
                fillOpacity: 0.7,
                weight: 1,
            }}
            eventHandlers={{
                popupopen: () => setIsPopupOpen(true),
                popupclose: () => setIsPopupOpen(false),
            }}
        >
            {!isPopupOpen && (
                <Tooltip>
                    <MapTooltipContent
                        label={valueFieldLabel}
                        value={point.displayValue}
                        lat={point.lat}
                        lon={point.lon}
                    />
                </Tooltip>
            )}
            <Popup>
                <MapPopupContent
                    label={valueFieldLabel}
                    value={point.displayValue}
                    lat={point.lat}
                    lon={point.lon}
                    onCopy={handleCopy}
                />
            </Popup>
        </CircleMarker>
    );
};

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

type SimpleMapProps = {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
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

const SimpleMap: FC<SimpleMapProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { isLoading, visualizationConfig, resultsData, leafletMapRef } =
            useVisualizationContext();
        const mapConfig = useLeafletMapConfig({
            isInDashboard: props.isInDashboard,
        });

        const [geoJsonData, setGeoJsonData] =
            useState<GeoJSON.FeatureCollection | null>(null);

        const hasSignaledScreenshotReady = useRef(false);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current) return;
            if (!onScreenshotReady && !onScreenshotError) return;
            if (!isLoading) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
        }, [isLoading, mapConfig, onScreenshotReady, onScreenshotError]);

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
            const values = scatterData
                .map((d) => d.value)
                .filter((v): v is number => v !== null);
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
                // Use 0.5 scale for non-numeric values
                const scale =
                    point.value === null
                        ? 0.5
                        : max === min
                        ? 0.5
                        : (point.value - min) / (max - min);
                return [point.lat, point.lon, scale];
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

        // Shared copy handler for popup buttons
        const clipboard = useClipboard({ timeout: 200 });
        const { showToastSuccess } = useToaster();

        const handlePopupCopyClick = useCallback(
            (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                const button = target.closest(
                    '[data-copy-value]',
                ) as HTMLElement | null;
                if (button) {
                    const value = button.dataset.copyValue;
                    if (value) {
                        clipboard.copy(value);
                        showToastSuccess({ title: 'Copied to clipboard!' });
                    }
                }
            },
            [clipboard, showToastSuccess],
        );

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

                const valueLabel = mapConfig?.valueFieldLabel || 'Value';
                const displayValue = value !== undefined ? value : 'No data';
                // eslint-disable-next-line testing-library/render-result-naming-convention
                const tooltipHtml = renderToString(
                    <MapTooltipContent
                        label={valueLabel}
                        value={displayValue}
                    />,
                );
                // eslint-disable-next-line testing-library/render-result-naming-convention
                const popupHtml = renderToString(
                    <MapPopupContent label={valueLabel} value={displayValue} />,
                );

                if (layer instanceof L.Path) {
                    // Bind both tooltip (hover) and popup (click)
                    layer.bindTooltip(tooltipHtml);
                    layer.bindPopup(popupHtml);

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
                        popupopen: (e) => {
                            // Hide tooltip when popup is open
                            layer.closeTooltip();
                            layer.unbindTooltip();
                            // Add click handler for copy button
                            const popupElement = e.popup.getElement();
                            popupElement?.addEventListener(
                                'click',
                                handlePopupCopyClick,
                            );
                        },
                        popupclose: (e) => {
                            // Remove click handler to prevent memory leak
                            const popupElement = e.popup.getElement();
                            popupElement?.removeEventListener(
                                'click',
                                handlePopupCopyClick,
                            );
                            // Re-bind tooltip when popup is closed
                            layer.bindTooltip(tooltipHtml);
                        },
                    });
                }
            },
            [regionDataMap, mapConfig?.valueFieldLabel, handlePopupCopyClick],
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
                        minZoom={2}
                        maxBounds={[
                            [-90, -180],
                            [90, 180],
                        ]}
                        maxBoundsViscosity={1.0}
                    >
                        <MapRefUpdater mapRef={leafletMapRef} />
                        <MapExtentTracker
                            saveMapExtent={
                                extentSetters?.saveMapExtent ?? false
                            }
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
                                    radius: mapConfig.heatmapConfig.radius,
                                    blur: mapConfig.heatmapConfig.blur,
                                    minOpacity: mapConfig.heatmapConfig.opacity,
                                }}
                            />
                        ) : (
                            sizeScale &&
                            scatterData.map((point, idx) => {
                                const radius = sizeScale(point.sizeValue); // Use default color (middle of scale) for non-numeric values
                                const color =
                                    point.value !== null
                                        ? getColorForValue(
                                              point.value,
                                              scatterValueRange.min,
                                              scatterValueRange.max,
                                              mapConfig.colors.scale,
                                          )
                                        : mapConfig.colors.scale[
                                              Math.floor(
                                                  mapConfig.colors.scale
                                                      .length / 2,
                                              )
                                          ];

                                return (
                                    <MapMarker
                                        key={idx}
                                        point={point}
                                        radius={radius}
                                        color={color}
                                        valueFieldLabel={
                                            mapConfig.valueFieldLabel || 'Value'
                                        }
                                    />
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
                        minZoom={2}
                        maxBounds={[
                            [-90, -180],
                            [90, 180],
                        ]}
                        maxBoundsViscosity={1.0}
                    >
                        <MapRefUpdater mapRef={leafletMapRef} />
                        <MapExtentTracker
                            saveMapExtent={
                                extentSetters?.saveMapExtent ?? false
                            }
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
    },
);

export default SimpleMap;
