import { MapChartType } from '@lightdash/common';
import { Box, Divider, Stack, Text, UnstyledButton } from '@mantine/core';
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
    type TooltipFieldInfo,
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

// Helper to get formatted value from row data
const getFormattedValue = (
    rowData: Record<string, any>,
    fieldId: string,
): string => {
    const field = rowData[fieldId];
    if (!field) return '';
    return field.value?.formatted ?? field.value?.raw ?? '';
};

// Shared tooltip content component
type MapTooltipContentProps = {
    tooltipFields: TooltipFieldInfo[];
    rowData: Record<string, any>;
    lat?: number;
    lon?: number;
};

const MapTooltipContent: FC<MapTooltipContentProps> = ({
    tooltipFields,
    rowData,
    lat,
    lon,
}) => {
    const visibleFields = tooltipFields.filter((f) => f.visible);

    // Using inline styles because this is rendered via renderToString
    // and Mantine styles won't be applied
    return (
        <div style={{ padding: '4px 6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleFields.map((field) => (
                    <div key={field.fieldId} style={{ fontSize: 14 }}>
                        <strong>{field.label}:</strong>{' '}
                        {getFormattedValue(rowData, field.fieldId)}
                    </div>
                ))}
            </div>
            {lat !== undefined && lon !== undefined && (
                <div
                    style={{
                        fontSize: 12,
                        color: '#868e96',
                        marginTop: 8,
                    }}
                >
                    Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
                </div>
            )}
        </div>
    );
};

// Shared popup content component
type MapPopupContentProps = {
    tooltipFields: TooltipFieldInfo[];
    rowData: Record<string, any>;
    lat?: number;
    lon?: number;
    onCopy?: () => void;
};

const MapPopupContent: FC<MapPopupContentProps> = ({
    tooltipFields,
    rowData,
    lat,
    lon,
    onCopy,
}) => {
    const visibleFields = tooltipFields.filter((f) => f.visible);
    const hasMultipleFields = visibleFields.length > 1;

    // Build copy value - CSV format for multiple fields, single value otherwise
    const copyValue =
        visibleFields.length > 0
            ? hasMultipleFields
                ? visibleFields
                      .map((field) => getFormattedValue(rowData, field.fieldId))
                      .join(', ')
                : getFormattedValue(rowData, visibleFields[0].fieldId)
            : '';

    return (
        // Force light mode colors since Leaflet popups always have white background
        <Box mt="xl" c="dark.9">
            <Stack spacing={2}>
                {visibleFields.map((field) => (
                    <Text key={field.fieldId} size="sm">
                        <strong>{field.label}:</strong>{' '}
                        {getFormattedValue(rowData, field.fieldId)}
                    </Text>
                ))}
            </Stack>
            {lat !== undefined && lon !== undefined && (
                <Text size="xs" c="gray.6" mt="sm" mb="md">
                    Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
                </Text>
            )}
            {copyValue && (
                <>
                    <Divider my="xs" c="gray.3" />
                    <UnstyledButton
                        onClick={onCopy}
                        data-copy-value={copyValue}
                        className={classes.popupActionButton}
                    >
                        <MantineIcon icon={IconCopy} />
                        <Text size="sm">
                            {hasMultipleFields ? 'Copy values' : 'Copy value'}
                        </Text>
                    </UnstyledButton>
                </>
            )}
        </Box>
    );
};

// MapMarker component for scatter points with tooltip/popup behavior
type MapMarkerProps = {
    point: ScatterPoint;
    radius: number;
    color: string;
    tooltipFields: TooltipFieldInfo[];
};

const MapMarker: FC<MapMarkerProps> = ({
    point,
    radius,
    color,
    tooltipFields,
}) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();

    const handleCopy = useCallback(() => {
        const visibleFields = tooltipFields.filter((f) => f.visible);
        const copyValue =
            visibleFields.length > 0
                ? visibleFields.length > 1
                    ? visibleFields
                          .map((field) =>
                              getFormattedValue(point.rowData, field.fieldId),
                          )
                          .join(', ')
                    : getFormattedValue(point.rowData, visibleFields[0].fieldId)
                : '';
        clipboard.copy(copyValue);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [clipboard, tooltipFields, point.rowData, showToastSuccess]);

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
                        tooltipFields={tooltipFields}
                        rowData={point.rowData}
                        lat={point.lat}
                        lon={point.lon}
                    />
                </Tooltip>
            )}
            <Popup>
                <MapPopupContent
                    tooltipFields={tooltipFields}
                    rowData={point.rowData}
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
        const [geoJsonLayerKey, setGeoJsonLayerKey] = useState(0);

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

        // Force re-creating the GeoJSON layer when join key, tooltip fields, or
        // region data change so bound tooltips/popup content stays in sync.
        useEffect(() => {
            if (
                !geoJsonData ||
                !mapConfig ||
                mapConfig.isLatLong ||
                !geoJsonData.features?.length
            ) {
                return;
            }
            setGeoJsonLayerKey((key) => key + 1);
        }, [
            geoJsonData,
            mapConfig?.geoJsonUrl,
            mapConfig?.geoJsonPropertyKey,
            mapConfig?.regionData,
            mapConfig?.tooltipFields,
            mapConfig?.isLatLong,
            mapConfig,
        ]);

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
            const dataMap = new Map<
                string,
                { value: number; rowData?: Record<string, any> }
            >();
            regionData.forEach((d) => {
                dataMap.set(d.name.toLowerCase(), {
                    value: d.value,
                    rowData: d.rowData,
                });
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

                // Use configured property key to match GeoJSON features to data
                const propertyKey = mapConfig.geoJsonPropertyKey;
                const propertyValue = (
                    feature.properties[propertyKey] ||
                    feature.properties.name ||
                    feature.properties.NAME ||
                    ''
                )
                    .toString()
                    .toLowerCase();
                const regionEntry = regionDataMap.get(propertyValue);

                if (regionEntry !== undefined) {
                    const color = getColorForValue(
                        regionEntry.value,
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
                // Use configured property key to match GeoJSON features to data
                const propertyKey = mapConfig?.geoJsonPropertyKey || 'name';
                const propertyValue = (
                    feature.properties?.[propertyKey] ||
                    feature.properties?.name ||
                    feature.properties?.NAME ||
                    ''
                )
                    .toString()
                    .toLowerCase();
                const regionEntry = regionDataMap.get(propertyValue);
                const rowData = regionEntry?.rowData || {};

                // eslint-disable-next-line testing-library/render-result-naming-convention
                const tooltipHtml = renderToString(
                    <MapTooltipContent
                        tooltipFields={mapConfig?.tooltipFields || []}
                        rowData={rowData}
                    />,
                );
                // eslint-disable-next-line testing-library/render-result-naming-convention
                const popupHtml = renderToString(
                    <MapPopupContent
                        tooltipFields={mapConfig?.tooltipFields || []}
                        rowData={rowData}
                    />,
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
            [
                regionDataMap,
                mapConfig?.geoJsonPropertyKey,
                mapConfig?.tooltipFields,
                handlePopupCopyClick,
            ],
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
                                        tooltipFields={mapConfig.tooltipFields}
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
                                    key={`geojson-${mapConfig.geoJsonUrl}-${geoJsonLayerKey}-${geoJsonData.features.length}`}
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
