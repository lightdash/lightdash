import { CLUSTER_CONFIG_DEFAULTS } from '@lightdash/common';
import type L from 'leaflet';
import { useMemo } from 'react';
import Supercluster from 'supercluster';
import type { ScatterPoint } from './useLeafletMapConfig';

type PointProperties = {
    index: number;
    point: ScatterPoint;
};

export type ClusterPoint = {
    type: 'cluster';
    id: number;
    lat: number;
    lon: number;
    pointCount: number;
    expansionZoom: number;
};

export type IndividualPoint = {
    type: 'point';
    index: number;
    point: ScatterPoint;
};

export type ClusterOrPoint = ClusterPoint | IndividualPoint;

const CLUSTER_MAX_ZOOM = 16;

const useSupercluster = (
    scatterData: ScatterPoint[],
    zoom: number,
    bounds: L.LatLngBounds | null,
    enabled: boolean = CLUSTER_CONFIG_DEFAULTS.enabled,
    radius: number = CLUSTER_CONFIG_DEFAULTS.radius,
    minPoints: number = CLUSTER_CONFIG_DEFAULTS.minPoints,
): ClusterOrPoint[] => {
    // Build the supercluster index when scatter data, radius, or minPoints changes (O(n log n))
    const index = useMemo(() => {
        const cluster = new Supercluster<PointProperties>({
            radius,
            maxZoom: CLUSTER_MAX_ZOOM,
            minPoints,
        });

        const features: GeoJSON.Feature<GeoJSON.Point, PointProperties>[] =
            scatterData.map((point, i) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [point.lon, point.lat],
                },
                properties: {
                    index: i,
                    point,
                },
            }));

        cluster.load(features);
        return cluster;
    }, [scatterData, radius, minPoints]);

    // Query clusters for current viewport (O(k), runs on every pan/zoom)
    return useMemo(() => {
        const asIndividualPoints = (): IndividualPoint[] =>
            scatterData.map((point, i) => ({
                type: 'point',
                index: i,
                point,
            }));

        if (!enabled) {
            return asIndividualPoints();
        }

        if (!bounds) {
            // No bounds yet (initial render) — return all points unclustered
            return asIndividualPoints();
        }

        const bbox: GeoJSON.BBox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
        ];

        const clusters = index.getClusters(bbox, Math.floor(zoom));

        return clusters.map((feature): ClusterOrPoint => {
            const [lon, lat] = feature.geometry.coordinates;

            if ('cluster' in feature.properties && feature.properties.cluster) {
                const clusterId = feature.properties.cluster_id;
                return {
                    type: 'cluster',
                    id: clusterId,
                    lat,
                    lon,
                    pointCount: feature.properties.point_count,
                    expansionZoom: index.getClusterExpansionZoom(clusterId),
                };
            }

            const pointProps = feature.properties as PointProperties;
            return {
                type: 'point',
                index: pointProps.index,
                point: pointProps.point,
            };
        });
    }, [index, bounds, zoom, scatterData, enabled]);
};

export default useSupercluster;
