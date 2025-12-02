import L from 'leaflet';
import 'leaflet.heat';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

type HeatmapPoint = [number, number, number]; // [lat, lng, intensity]

type HeatmapLayerProps = {
    points: HeatmapPoint[];
    options?: {
        radius?: number;
        blur?: number;
        maxZoom?: number;
        max?: number;
        minOpacity?: number;
        gradient?: Record<number, string>;
    };
};

const HeatmapLayer = ({ points, options = {} }: HeatmapLayerProps) => {
    const map = useMap();

    useEffect(() => {
        if (!map || points.length === 0) return;

        const defaultOptions = {
            radius: 25,
            blur: 10,
            maxZoom: 17,
            minOpacity: 0.7,
            ...options,
        };

        // Create the heat layer
        const heatLayer = L.heatLayer(points, defaultOptions);
        heatLayer.addTo(map);

        return () => {
            map.removeLayer(heatLayer);
        };
    }, [map, points, options]);

    return null;
};

export default HeatmapLayer;
