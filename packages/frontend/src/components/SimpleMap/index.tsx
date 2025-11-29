import { MapChartType } from '@lightdash/common';
import { IconMap } from '@tabler/icons-react';
import { scaleSqrt } from 'd3-scale';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { memo, useEffect, useState, type FC } from 'react';
import {
    CircleMarker,
    GeoJSON,
    MapContainer,
    Popup,
    TileLayer,
} from 'react-leaflet';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';
import useLeafletMapConfig from '../../hooks/leaflet/useLeafletMapConfig';
import { isMapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import HeatmapLayer from './HeatmapLayer';

// Custom styles for Leaflet zoom controls
const leafletCustomStyles = `
.leaflet-control-zoom {
    border: none !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
}
.leaflet-control-zoom a {
    width: 24px !important;
    height: 24px !important;
    line-height: 24px !important;
    font-size: 14px !important;
    background-color: rgba(255, 255, 255, 0.8) !important;
    color: #666 !important;
    border: none !important;
}
.leaflet-control-zoom a:hover {
    background-color: rgba(255, 255, 255, 0.95) !important;
    color: #333 !important;
}
.leaflet-control-zoom-in {
    border-radius: 4px 4px 0 0 !important;
}
.leaflet-control-zoom-out {
    border-radius: 0 0 4px 4px !important;
}
`;

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
    const { isLoading, visualizationConfig, resultsData } =
        useVisualizationContext();
    const mapConfig = useLeafletMapConfig({
        isInDashboard: props.isInDashboard,
    });

    const [geoJsonData, setGeoJsonData] =
        useState<GeoJSON.FeatureCollection | null>(null);

    // Inject custom Leaflet styles
    useEffect(() => {
        const styleId = 'leaflet-custom-styles';
        if (!document.getElementById(styleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = leafletCustomStyles;
            document.head.appendChild(styleElement);
        }
    }, []);

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
    const locationType = isMapVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig.locationType
        : undefined;

    if (isLoading) {
        return <LoadingChart />;
    }

    if (!mapConfig) {
        return <EmptyChart locationType={locationType} />;
    }

    const containerStyle: React.CSSProperties = props.$shouldExpand
        ? {
              minHeight: 'inherit',
              height: '100%',
              width: '100%',
              position: 'relative',
              zIndex: 0,
          }
        : {
              minHeight: 'inherit',
              height: '400px',
              width: '100%',
              position: 'relative',
              zIndex: 0,
          };

    // Scatter/Heatmap mode - render markers or heatmap (show map even without data)
    if (mapConfig.isLatLong) {
        const scatterData = mapConfig.scatterData || [];
        const scatterValues = scatterData.map((d) => d.value);
        const minValue =
            scatterValues.length > 0 ? Math.min(...scatterValues, 0) : 0;
        const maxValue =
            scatterValues.length > 0 ? Math.max(...scatterValues, 1) : 1;

        // Create d3 sqrt scale for proportional circle sizing (scatter mode)
        const sizeScale = scaleSqrt()
            .domain([minValue, maxValue])
            .range([mapConfig.minBubbleSize, mapConfig.maxBubbleSize]);

        // Prepare heatmap points: [lat, lng, intensity]
        const heatmapPoints: [number, number, number][] = scatterData.map(
            (point) => {
                // Normalize intensity to 0-1 range
                const intensity =
                    maxValue === minValue
                        ? 0.5
                        : (point.value - minValue) / (maxValue - minValue);
                return [point.lat, point.lon, intensity];
            },
        );

        // Build gradient from color scale
        const heatmapGradient: Record<number, string> = {};
        mapConfig.colors.scale.forEach((color, index) => {
            const position = index / (mapConfig.colors.scale.length - 1);
            heatmapGradient[position] = color;
        });

        const isHeatmap = mapConfig.locationType === MapChartType.HEATMAP;

        return (
            <div
                style={containerStyle}
                className={props.className}
                data-testid={props['data-testid']}
            >
                <MapContainer
                    center={mapConfig.center}
                    zoom={mapConfig.zoom}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom
                >
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
                        scatterData.map((point, idx) => {
                            const radius = sizeScale(point.value);
                            const color = getColorForValue(
                                point.value,
                                minValue,
                                maxValue,
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
                                            <strong>Value:</strong>{' '}
                                            {point.value}
                                            <br />
                                            <strong>Lat:</strong>{' '}
                                            {point.lat.toFixed(4)}
                                            <br />
                                            <strong>Lon:</strong>{' '}
                                            {point.lon.toFixed(4)}
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            );
                        })
                    )}
                </MapContainer>
            </div>
        );
    }

    // Choropleth mode - render GeoJSON with regions colored by data
    if (!mapConfig.isLatLong && geoJsonData) {
        const regionData = mapConfig.regionData || [];
        const dataMap = new Map<string, number>();
        regionData.forEach((d) => {
            dataMap.set(d.name.toLowerCase(), d.value);
        });

        const values = regionData.map((d) => d.value);
        const minValue = values.length > 0 ? Math.min(...values) : 0;
        const maxValue = values.length > 0 ? Math.max(...values) : 1;

        const style = (feature: any): L.PathOptions => {
            if (!feature?.properties) {
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
            const value = dataMap.get(name);

            if (value !== undefined) {
                const color = getColorForValue(
                    value,
                    minValue,
                    maxValue,
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

            // Default style for regions without data
            return {
                fillColor: '#f3f3f3',
                weight: 0.5,
                opacity: 1,
                color: '#999',
                fillOpacity: 0.5,
            };
        };

        const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
            const name =
                feature.properties?.name ||
                feature.properties?.NAME ||
                'Unknown';
            const value = dataMap.get(name.toLowerCase());

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

            const popupContent = `
                <div>
                    <strong>${name}</strong><br/>
                    Value: ${value !== undefined ? value : 'No data'}
                </div>
            `;

            (layer as L.Path).bindPopup(popupContent);
        };

        return (
            <div
                style={containerStyle}
                className={props.className}
                data-testid={props['data-testid']}
            >
                <MapContainer
                    center={mapConfig.center}
                    zoom={mapConfig.zoom}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom
                >
                    {mapConfig.tile.url && (
                        <TileLayer
                            attribution={mapConfig.tile.attribution}
                            url={mapConfig.tile.url}
                        />
                    )}
                    {geoJsonData.features &&
                        geoJsonData.features.length > 0 && (
                            <GeoJSON
                                key={`geojson-${geoJsonData.features.length}`}
                                data={geoJsonData}
                                style={style}
                                onEachFeature={onEachFeature}
                            />
                        )}
                </MapContainer>
            </div>
        );
    }

    return <EmptyChart locationType={locationType} />;
});

export default SimpleMap;
