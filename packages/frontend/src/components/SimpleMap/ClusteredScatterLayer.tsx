import L from 'leaflet';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import type {
    ScatterPoint,
    TooltipFieldInfo,
} from '../../hooks/leaflet/useLeafletMapConfig';
import useSupercluster from '../../hooks/leaflet/useSupercluster';
import { MapMarker } from './MapMarker';
// eslint-disable-next-line css-modules/no-unused-class
import classes from './SimpleMap.module.css';

type ClusteredScatterLayerProps = {
    scatterData: ScatterPoint[];
    sizeScale: (value: number) => number;
    scatterColorScale: ((value: number) => string) | null;
    categoricalColorMap: Map<string, string> | null;
    fillOpacity: number;
    noDataColor: string;
    tooltipFields: TooltipFieldInfo[];
    hideTooltip: boolean;
    onPointClick: (
        e: L.LeafletMouseEvent,
        rowData: Record<string, any>,
        copyValue: string,
        lat: number,
        lon: number,
    ) => void;
    clusterEnabled: boolean;
    clusterRadius: number;
    clusterMinPoints: number;
};

const formatCount = (count: number): string => {
    if (count >= 1000000) return `${Math.round(count / 1000000)}M`;
    if (count >= 1000) return `${Math.round(count / 1000)}k`;
    return String(count);
};

type ClusterMarkerProps = {
    lat: number;
    lon: number;
    pointCount: number;
    onClick: () => void;
};

const CLUSTER_BASE_SIZE = 15;
const CLUSTER_MAX_SIZE = 40;

const ClusterMarker: FC<ClusterMarkerProps> = memo(
    ({ lat, lon, pointCount, onClick }) => {
        // Fixed base size, grows logarithmically with point count
        const size = Math.min(
            CLUSTER_BASE_SIZE + Math.log2(pointCount) * 5,
            CLUSTER_MAX_SIZE,
        );

        const icon = useMemo(
            () =>
                L.divIcon({
                    html: `<div class="${classes.clusterMarker}" style="width:${size}px;height:${size}px"><span>${formatCount(pointCount)}</span></div>`,
                    className: '',
                    iconSize: L.point(size, size),
                    iconAnchor: L.point(size / 2, size / 2),
                }),
            [pointCount, size],
        );

        return (
            <Marker
                position={[lat, lon]}
                icon={icon}
                eventHandlers={{ click: onClick }}
            />
        );
    },
);
ClusterMarker.displayName = 'ClusterMarker';

const ClusteredScatterLayer: FC<ClusteredScatterLayerProps> = ({
    scatterData,
    sizeScale,
    scatterColorScale,
    categoricalColorMap,
    fillOpacity,
    noDataColor,
    tooltipFields,
    hideTooltip,
    onPointClick,
    clusterEnabled,
    clusterRadius,
    clusterMinPoints,
}) => {
    const map = useMap();

    const [zoom, setZoom] = useState(() => map.getZoom());
    const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => {
        try {
            return map.getBounds();
        } catch {
            return null;
        }
    });

    useMapEvents({
        moveend: () => {
            setZoom(map.getZoom());
            setBounds(map.getBounds());
        },
        zoomend: () => {
            setZoom(map.getZoom());
            setBounds(map.getBounds());
        },
    });

    const clusterData = useSupercluster(
        scatterData,
        zoom,
        bounds,
        clusterEnabled,
        clusterRadius,
        clusterMinPoints,
    );

    const handleClusterClick = useCallback(
        (lat: number, lon: number, expansionZoom: number) => {
            map.flyTo([lat, lon], expansionZoom);
        },
        [map],
    );

    return (
        <>
            {clusterData.map((item) => {
                if (item.type === 'cluster') {
                    return (
                        <ClusterMarker
                            key={`cluster-${item.id}`}
                            lat={item.lat}
                            lon={item.lon}
                            pointCount={item.pointCount}
                            onClick={() =>
                                handleClusterClick(
                                    item.lat,
                                    item.lon,
                                    item.expansionZoom,
                                )
                            }
                        />
                    );
                }

                const { point } = item;
                const radius = sizeScale(point.sizeValue);
                const color =
                    categoricalColorMap && point.stringValue
                        ? (categoricalColorMap.get(point.stringValue) ??
                          noDataColor)
                        : point.value !== null && scatterColorScale
                          ? scatterColorScale(point.value)
                          : noDataColor;

                return (
                    <MapMarker
                        key={`point-${item.index}`}
                        point={point}
                        radius={radius}
                        color={color}
                        fillOpacity={fillOpacity}
                        tooltipFields={tooltipFields}
                        hideTooltip={hideTooltip}
                        onClick={onPointClick}
                    />
                );
            })}
        </>
    );
};

export default ClusteredScatterLayer;
