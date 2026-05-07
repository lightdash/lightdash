import { MapHexbinSizingMode } from '@lightdash/common';
import { scaleLinear } from 'd3-scale';
import { useEffect, useMemo, useState } from 'react';
import { Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';
import { computeHexbinsWithMeta, type HexBin } from './hexbinUtils';
import { zoomToResolution } from './zoomToResolution';

type Props = {
    points: ScatterPoint[];
    colorScale: string[];
    opacity: number;
    valueFieldLabel: string | null;
    sizingMode: MapHexbinSizingMode;
    /** Used when sizingMode === FIXED. */
    fixedResolution: number;
    onTruncated?: (info: { totalPoints: number } | null) => void;
};

const HexbinLayer = ({
    points,
    colorScale,
    opacity,
    valueFieldLabel,
    sizingMode,
    fixedResolution,
    onTruncated,
}: Props) => {
    const map = useMap();
    const [zoom, setZoom] = useState<number>(map.getZoom());

    useMapEvents({
        zoomend: () => setZoom(map.getZoom()),
    });

    const result = useMemo(() => {
        const resolution =
            sizingMode === MapHexbinSizingMode.FIXED
                ? fixedResolution
                : zoomToResolution(zoom);
        return computeHexbinsWithMeta(points, resolution);
    }, [points, zoom, sizingMode, fixedResolution]);

    useEffect(() => {
        if (result.truncated) {
            onTruncated?.({ totalPoints: result.totalPoints });
        } else {
            onTruncated?.(null);
        }
    }, [result.truncated, result.totalPoints, onTruncated]);

    // Color by sum if any bin has a numeric sum, else fall back to count.
    const colorBy: 'sum' | 'count' = useMemo(
        () => (result.bins.some((b) => b.sum !== null) ? 'sum' : 'count'),
        [result.bins],
    );

    const scale = useMemo(() => {
        if (result.bins.length === 0) return null;
        const values = result.bins.map((b) =>
            colorBy === 'sum' ? (b.sum ?? 0) : b.count,
        );
        const min = Math.min(...values);
        const max = Math.max(...values);
        const stops = Math.max(colorScale.length - 1, 1);
        const domain = colorScale.map(
            (_, i) => min + ((max - min) * i) / stops,
        );
        return scaleLinear<string>()
            .domain(domain)
            .range(colorScale)
            .clamp(true);
    }, [result.bins, colorScale, colorBy]);

    if (!scale || result.bins.length === 0) return null;

    return (
        <>
            {result.bins.flatMap((bin: HexBin) => {
                const metric = colorBy === 'sum' ? (bin.sum ?? 0) : bin.count;
                const color = scale(metric);
                return bin.rings.map((ring, ringIdx) => (
                    <Polygon
                        key={`${bin.h3Index}-${ringIdx}`}
                        positions={ring}
                        pathOptions={{
                            color,
                            fillColor: color,
                            fillOpacity: opacity,
                            weight: 1,
                            opacity,
                        }}
                    >
                        <Tooltip sticky>
                            <div>
                                <div>Count: {bin.count}</div>
                                {bin.sum !== null && (
                                    <div>
                                        {valueFieldLabel
                                            ? `${valueFieldLabel} (sum)`
                                            : 'Sum'}
                                        : {bin.sum}
                                    </div>
                                )}
                            </div>
                        </Tooltip>
                    </Polygon>
                ));
            })}
        </>
    );
};

export default HexbinLayer;
