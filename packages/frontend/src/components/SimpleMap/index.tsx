import { MapChartLocation, MapChartType } from '@lightdash/common';
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
import {
    explorerActions,
    useExplorerDispatch,
} from '../../features/explorer/store';
import useLeafletMapConfig, {
    type ScatterPoint,
    type TooltipFieldInfo,
} from '../../hooks/leaflet/useLeafletMapConfig';
import useToaster from '../../hooks/toaster/useToaster';
import { createMultiColorScale } from '../../utils/colorUtils';
import { isMapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LoadingChart from '../common/LoadingChart';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import HeatmapLayer from './HeatmapLayer';
import MapLegend from './MapLegend';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';
import {
    MAP_FILL_NO_BASE_MAP_OPACITY,
    MAP_FILL_NO_DATA_OPACITY,
    MAP_FILL_WITH_DATA_OPACITY,
} from './constants';

// Helper to get formatted value from row data
const getFormattedValue = (
    rowData: Record<string, any>,
    fieldId: string,
): string => {
    const field = rowData[fieldId];
    if (!field) return '';
    return field.value?.formatted ?? field.value?.raw ?? '';
};

// Shared props for tooltip and popup content
type MapContentBaseProps = {
    tooltipFields: TooltipFieldInfo[];
    rowData: Record<string, any>;
    lat?: number;
    lon?: number;
    // For "no data" regions
    noData?: {
        locationLabel: string;
        locationValue: string;
    };
};

type MapTooltipContentProps = MapContentBaseProps;

// NOTE: Using inline styles because this is rendered via renderToString
// and Mantine styles won't be applied
const MapTooltipContent: FC<MapTooltipContentProps> = ({
    tooltipFields,
    rowData,
    lat,
    lon,
    noData,
}) => {
    const visibleFields = tooltipFields.filter((f) => f.visible);

    if (noData) {
        return (
            <div style={{ padding: '4px 6px' }}>
                <div style={{ fontSize: 14 }}>
                    <strong>{noData.locationLabel}:</strong>{' '}
                    {noData.locationValue}
                </div>
                <div
                    style={{
                        fontSize: 14,
                        color: '#868e96',
                        fontStyle: 'italic',
                    }}
                >
                    No data
                </div>
            </div>
        );
    }

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

type MapPopupContentProps = MapContentBaseProps & {
    onCopy?: () => void;
};

const MapPopupContent: FC<MapPopupContentProps> = ({
    tooltipFields,
    rowData,
    lat,
    lon,
    onCopy,
    noData,
}) => {
    const visibleFields = tooltipFields.filter((f) => f.visible);
    const hasMultipleFields = visibleFields.length > 1;

    // Show "no data" popup for regions without matching data
    if (noData) {
        return (
            <Box mt="xl" c="dark.9">
                <Text size="sm">
                    <strong>{noData.locationLabel}:</strong>{' '}
                    {noData.locationValue}
                </Text>
                <Text size="sm" c="gray.6" fs="italic">
                    No data
                </Text>
            </Box>
        );
    }

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
    fillOpacity: number;
    tooltipFields: TooltipFieldInfo[];
};

const MapMarker: FC<MapMarkerProps> = ({
    point,
    radius,
    color,
    fillOpacity,
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
                fillOpacity,
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

// Component to track map extent and dispatch to Redux
// This does NOT cause re-renders because nothing subscribes to mapExtent during render
const MapExtentTracker: FC = () => {
    const map = useMap();
    const dispatch = useExplorerDispatch();

    useEffect(() => {
        const updateExtent = () => {
            try {
                const center = map.getCenter();
                const zoom = map.getZoom();
                dispatch(
                    explorerActions.setMapExtent({
                        zoom,
                        lat: center.lat,
                        lng: center.lng,
                    }),
                );
            } catch {
                // Map might not be ready
            }
        };

        // Initial capture
        updateExtent();

        // Update on map move/zoom
        map.on('moveend', updateExtent);
        map.on('zoomend', updateExtent);

        return () => {
            map.off('moveend', updateExtent);
            map.off('zoomend', updateExtent);
            dispatch(explorerActions.setMapExtent(null));
        };
    }, [map, dispatch]);

    return null;
};

// Component to auto-fit map bounds to data on initial load
// Only fits once per unique geoJsonUrl/mapType combination
// Skips fitting if there's a saved extent (hasSavedExtent=true)
const MapBoundsFitter: FC<{
    geoJsonData: GeoJSON.FeatureCollection | null;
    scatterData: ScatterPoint[] | null;
    mapType: MapChartLocation;
    geoJsonUrl: string | null;
    hasSavedExtent: boolean;
}> = ({ geoJsonData, scatterData, mapType, geoJsonUrl, hasSavedExtent }) => {
    const map = useMap();
    // Track the last fitted configuration to prevent re-fitting on re-renders
    const lastFittedRef = useRef<{
        mapType: MapChartLocation;
        geoJsonUrl: string | null;
        hasFitted: boolean;
    } | null>(null);

    useEffect(() => {
        // If there's a saved extent, don't override it with auto-fitting
        if (hasSavedExtent) {
            lastFittedRef.current = { mapType, geoJsonUrl, hasFitted: true };
            return;
        }

        // Check if we've already fitted for this exact mapType + URL combination
        const isSameConfig =
            lastFittedRef.current &&
            lastFittedRef.current.mapType === mapType &&
            lastFittedRef.current.geoJsonUrl === geoJsonUrl &&
            lastFittedRef.current.hasFitted;

        if (isSameConfig) {
            return; // Already fitted for this configuration, skip
        }

        // For built-in maps, use fixed center/zoom instead of fitBounds
        // (Alaska/Hawaii throw off USA bounds, and world should be centered)
        if (mapType === MapChartLocation.USA) {
            // Center on continental US
            map.setView([39.8283, -98.5795], 3);
            lastFittedRef.current = { mapType, geoJsonUrl, hasFitted: true };
            return;
        }

        if (mapType === MapChartLocation.WORLD) {
            // Center at 0,0 and zoom out to show full world
            map.setView([0, 0], 1.2);
            lastFittedRef.current = { mapType, geoJsonUrl, hasFitted: true };
            return;
        }

        // For custom maps, fit to GeoJSON bounds
        if (geoJsonData && geoJsonData.features.length > 0) {
            try {
                const geoJsonLayer = L.geoJSON(geoJsonData);
                const bounds = geoJsonLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [20, 20] });
                    lastFittedRef.current = {
                        mapType,
                        geoJsonUrl,
                        hasFitted: true,
                    };
                }
            } catch (error) {
                console.warn('Failed to fit map to GeoJSON bounds:', error);
            }
            return;
        }

        // Fit to scatter data bounds (scatter/heatmap maps)
        if (scatterData && scatterData.length > 0) {
            try {
                const points = scatterData.map(
                    (p) => [p.lat, p.lon] as L.LatLngTuple,
                );
                const bounds = L.latLngBounds(points);
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [20, 20] });
                    lastFittedRef.current = {
                        mapType,
                        geoJsonUrl,
                        hasFitted: true,
                    };
                }
            } catch (error) {
                console.warn('Failed to fit map to scatter bounds:', error);
            }
        }
        // Note: geoJsonData and scatterData are intentionally in deps to re-fit when data loads,
        // but the ref check above prevents re-fitting on subsequent renders with same config
    }, [map, mapType, geoJsonUrl, geoJsonData, scatterData, hasSavedExtent]);

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
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const SimpleMap: FC<SimpleMapProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { isLoading, visualizationConfig, resultsData, leafletMapRef } =
            useVisualizationContext();
        const mapConfig = useLeafletMapConfig({
            isInDashboard: props.isInDashboard,
        });

        // Use mapConfig.extent directly - it has the correct values from the saved chart
        // via the visualization context
        const effectiveExtent = mapConfig?.extent;

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

            // Clear old data first to unmount the layer before loading new data
            setGeoJsonData(null);

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
        // Note: Don't include mapConfig itself as it's a new object each render
        useEffect(() => {
            if (
                !geoJsonData ||
                mapConfig?.isLatLong ||
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

        // Memoized color scale for scatter points
        const scatterColorScale = useMemo(() => {
            if (!mapConfig) return null;
            return createMultiColorScale(
                scatterValueRange.min,
                scatterValueRange.max,
                mapConfig.colors.scale,
            );
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

        // When there's no base map, use opaque fills so shapes are fully visible
        const hasBaseMap = !!mapConfig?.tile.url;
        const fillOpacityWithData = hasBaseMap
            ? MAP_FILL_WITH_DATA_OPACITY
            : MAP_FILL_NO_BASE_MAP_OPACITY;
        const fillOpacityNoData = hasBaseMap
            ? MAP_FILL_NO_DATA_OPACITY
            : MAP_FILL_NO_BASE_MAP_OPACITY;
        const noDataColor = mapConfig?.noDataColor ?? '#f3f3f3';

        // Memoized color scale for choropleth regions
        const regionColorScale = useMemo(() => {
            if (!mapConfig) return null;
            return createMultiColorScale(
                regionValueRange.min,
                regionValueRange.max,
                mapConfig.colors.scale,
            );
        }, [mapConfig, regionValueRange.min, regionValueRange.max]);

        const choroplethStyle = useCallback(
            (feature: any): L.PathOptions => {
                if (!feature?.properties || !mapConfig) {
                    return {
                        fillColor: noDataColor,
                        weight: 0.5,
                        opacity: 1,
                        color: '#999',
                        fillOpacity: fillOpacityNoData,
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

                if (regionEntry !== undefined && regionColorScale) {
                    const fillColor = regionColorScale(regionEntry.value);
                    return {
                        fillColor,
                        weight: 1,
                        opacity: 1,
                        color: '#666',
                        fillOpacity: fillOpacityWithData,
                    };
                }

                return {
                    fillColor: noDataColor,
                    weight: 0.5,
                    opacity: 1,
                    color: '#999',
                    fillOpacity: fillOpacityNoData,
                };
            },
            [
                mapConfig,
                regionDataMap,
                regionColorScale,
                noDataColor,
                fillOpacityNoData,
                fillOpacityWithData,
            ],
        );

        const onEachFeature = useCallback(
            (feature: GeoJSON.Feature, layer: L.Layer) => {
                // Use configured property key to match GeoJSON features to data
                const propertyKey = mapConfig?.geoJsonPropertyKey || 'name';
                const rawPropertyValue =
                    feature.properties?.[propertyKey] ||
                    feature.properties?.name ||
                    feature.properties?.NAME ||
                    '';
                const propertyValue = rawPropertyValue.toString().toLowerCase();
                const regionEntry = regionDataMap.get(propertyValue);
                const rowData = regionEntry?.rowData || {};

                // For "no data" regions, derive location label from tooltipFields
                const locationFieldLabel =
                    mapConfig?.tooltipFields.find(
                        (f) => f.fieldId === mapConfig?.locationFieldId,
                    )?.label || 'Location';
                const noData = regionEntry
                    ? undefined
                    : {
                          locationLabel: locationFieldLabel,
                          locationValue: rawPropertyValue.toString(),
                      };

                // eslint-disable-next-line testing-library/render-result-naming-convention
                const tooltipHtml = renderToString(
                    <MapTooltipContent
                        tooltipFields={mapConfig?.tooltipFields || []}
                        rowData={rowData}
                        noData={noData}
                    />,
                );
                // eslint-disable-next-line testing-library/render-result-naming-convention
                const popupHtml = renderToString(
                    <MapPopupContent
                        tooltipFields={mapConfig?.tooltipFields || []}
                        rowData={rowData}
                        noData={noData}
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
                                fillOpacity: hasBaseMap ? 0.9 : 1,
                            });
                        },
                        mouseout: () => {
                            layer.setStyle({
                                weight: 1,
                                fillOpacity: fillOpacityWithData,
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
                mapConfig?.locationFieldId,
                handlePopupCopyClick,
                hasBaseMap,
                fillOpacityWithData,
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
                        // Key based on saved extent - forces remount when saved config changes
                        key={`scatter-${effectiveExtent?.lat}-${effectiveExtent?.lng}-${effectiveExtent?.zoom}`}
                        center={[
                            effectiveExtent?.lat ?? 20,
                            effectiveExtent?.lng ?? 0,
                        ]}
                        zoom={effectiveExtent?.zoom ?? 2}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom
                        minZoom={1}
                        maxBounds={[
                            [-90, -180],
                            [90, 180],
                        ]}
                        maxBoundsViscosity={1.0}
                    >
                        <MapRefUpdater mapRef={leafletMapRef} />
                        {/* Only track extent changes in explorer, not on dashboards */}
                        {!props.isInDashboard && <MapExtentTracker />}
                        <MapBoundsFitter
                            geoJsonData={null}
                            scatterData={scatterData}
                            mapType={mapConfig.mapType}
                            geoJsonUrl={null}
                            hasSavedExtent={mapConfig.hasSavedExtent}
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
                            scatterColorScale &&
                            scatterData.map((point, idx) => {
                                const radius = sizeScale(point.sizeValue);
                                // Use interpolated color for numeric values, middle of scale for non-numeric
                                const color =
                                    point.value !== null
                                        ? scatterColorScale(point.value)
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
                                        fillOpacity={fillOpacityWithData}
                                        tooltipFields={mapConfig.tooltipFields}
                                    />
                                );
                            })
                        )}
                    </MapContainer>
                    {mapConfig.showLegend && mapConfig.valueRange && (
                        <MapLegend
                            colors={mapConfig.colors.scale}
                            formattedMin={mapConfig.valueRange.formattedMin}
                            formattedMax={mapConfig.valueRange.formattedMax}
                            label={mapConfig.valueFieldLabel ?? undefined}
                            opacity={fillOpacityWithData}
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
                        // Key based on saved extent - forces remount when saved config changes
                        key={`choropleth-${effectiveExtent?.lat}-${effectiveExtent?.lng}-${effectiveExtent?.zoom}`}
                        center={[
                            effectiveExtent?.lat ?? 20,
                            effectiveExtent?.lng ?? 0,
                        ]}
                        zoom={effectiveExtent?.zoom ?? 2}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom
                        minZoom={1}
                        maxBounds={[
                            [-90, -180],
                            [90, 180],
                        ]}
                        maxBoundsViscosity={1.0}
                    >
                        <MapRefUpdater mapRef={leafletMapRef} />
                        {/* Only track extent changes in explorer, not on dashboards */}
                        {!props.isInDashboard && <MapExtentTracker />}
                        <MapBoundsFitter
                            geoJsonData={geoJsonData}
                            scatterData={null}
                            mapType={mapConfig.mapType}
                            geoJsonUrl={mapConfig.geoJsonUrl}
                            hasSavedExtent={mapConfig.hasSavedExtent}
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
                            formattedMin={mapConfig.valueRange.formattedMin}
                            formattedMax={mapConfig.valueRange.formattedMax}
                            label={mapConfig.valueFieldLabel ?? undefined}
                            opacity={fillOpacityWithData}
                        />
                    )}
                </div>
            );
        }

        return <EmptyChart locationType={locationType} />;
    },
);

export default SimpleMap;
