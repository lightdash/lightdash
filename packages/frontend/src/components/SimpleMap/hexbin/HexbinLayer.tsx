import {
    MapHexbinAggregation,
    MapHexbinSizingMode,
    MapHexbinValueBasis,
} from '@lightdash/common';
import { scaleLinear } from 'd3-scale';
import type * as L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';
import {
    computeHexbinsWithMeta,
    computeViewportEmptyBins,
    type HexBin,
    type ViewportBounds,
} from './hexbinUtils';
import { zoomToResolution } from './zoomToResolution';

type Props = {
    points: ScatterPoint[];
    colorScale: string[];
    opacity: number;
    valueFieldLabel: string | null;
    sizingMode: MapHexbinSizingMode;
    /** Used when sizingMode === FIXED. */
    fixedResolution: number;
    valueBasis: MapHexbinValueBasis;
    aggregation: MapHexbinAggregation;
    showEmptyBins: boolean;
    /** Empty-bin fill color, hex6 or hex8, or null = outline-only. */
    emptyBinColor: string | null;
    onTruncated?: (info: { totalPoints: number } | null) => void;
};

/** Pull the right per-bin number for the active aggregation. */
const aggValue = (
    bin: {
        sum: number | null;
        min: number | null;
        max: number | null;
        avg: number | null;
    },
    agg: MapHexbinAggregation,
): number | null => {
    switch (agg) {
        case MapHexbinAggregation.SUM:
            return bin.sum;
        case MapHexbinAggregation.AVG:
            return bin.avg;
        case MapHexbinAggregation.MIN:
            return bin.min;
        case MapHexbinAggregation.MAX:
            return bin.max;
        default:
            return null;
    }
};

const EMPTY_BIN_STROKE = '#6c757d';

/** Split a hex6 or hex8 color into a Leaflet-friendly {hex6, alpha} pair. */
const parseHexColor = (
    color: string,
): { hex: string; alpha: number } | null => {
    if (color.length === 9) {
        const alpha = parseInt(color.slice(7, 9), 16) / 255;
        return { hex: color.slice(0, 7), alpha };
    }
    if (color.length === 7) return { hex: color, alpha: 1 };
    return null;
};

const boundsToViewport = (bounds: L.LatLngBounds): ViewportBounds => ({
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
});

const HexbinLayer = ({
    points,
    colorScale,
    opacity,
    valueFieldLabel,
    sizingMode,
    fixedResolution,
    valueBasis,
    aggregation,
    showEmptyBins,
    emptyBinColor,
    onTruncated,
}: Props) => {
    const emptyFill = emptyBinColor ? parseHexColor(emptyBinColor) : null;
    const map = useMap();
    const [zoom, setZoom] = useState<number>(map.getZoom());
    const [viewport, setViewport] = useState<ViewportBounds>(() =>
        boundsToViewport(map.getBounds()),
    );

    // moveend covers both pan and zoom — fires once per gesture, no debouncing needed.
    useMapEvents({
        moveend: () => {
            setZoom(map.getZoom());
            setViewport(boundsToViewport(map.getBounds()));
        },
    });

    const resolution = useMemo(
        () =>
            sizingMode === MapHexbinSizingMode.FIXED
                ? fixedResolution
                : zoomToResolution(zoom),
        [sizingMode, fixedResolution, zoom],
    );

    // Populated bins are the expensive part (one h3 lookup per point), so we
    // memoize them independently of viewport changes. Pan doesn't recompute
    // them — only resolution or input data changes do.
    const populatedResult = useMemo(
        () => computeHexbinsWithMeta(points, resolution),
        [points, resolution],
    );
    const populatedBins = populatedResult.bins;

    const populatedSet = useMemo(
        () => new Set(populatedBins.map((b) => b.h3Index)),
        [populatedBins],
    );

    const emptyBins = useMemo(() => {
        if (!showEmptyBins) return [];
        return computeViewportEmptyBins(viewport, resolution, populatedSet);
    }, [showEmptyBins, viewport, resolution, populatedSet]);

    useEffect(() => {
        if (populatedResult.truncated) {
            onTruncated?.({ totalPoints: populatedResult.totalPoints });
        } else {
            onTruncated?.(null);
        }
    }, [populatedResult.truncated, populatedResult.totalPoints, onTruncated]);

    // Drive the per-bin metric explicitly from the user's choice. When
    // valueBasis = FIELD we use whichever aggregation they selected; otherwise
    // we color by count of points per cell.
    const isFieldColor = valueBasis === MapHexbinValueBasis.FIELD;
    const metricFor = (bin: HexBin): number =>
        isFieldColor ? (aggValue(bin, aggregation) ?? 0) : bin.count;

    const scale = useMemo(() => {
        if (populatedBins.length === 0) return null;
        const values = populatedBins.map(metricFor);
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
        // metricFor closes over isFieldColor + aggregation; deps cover those.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [populatedBins, colorScale, isFieldColor, aggregation]);

    if (!scale || populatedBins.length === 0) return null;

    return (
        <>
            {emptyBins.flatMap((bin: HexBin) =>
                bin.rings.map((ring, ringIdx) => (
                    <Polygon
                        key={`empty-${bin.h3Index}-${ringIdx}`}
                        positions={ring}
                        pathOptions={{
                            color: EMPTY_BIN_STROKE,
                            fillColor: emptyFill?.hex,
                            fillOpacity: emptyFill?.alpha ?? 0,
                            weight: 1,
                            opacity: 0.7,
                            interactive: false,
                        }}
                    />
                )),
            )}
            {populatedBins.flatMap((bin: HexBin) => {
                const color = scale(metricFor(bin));
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
                                {isFieldColor &&
                                    aggValue(bin, aggregation) !== null && (
                                        <div>
                                            {valueFieldLabel ?? 'Value'} (
                                            {aggregation}):{' '}
                                            {aggValue(bin, aggregation)}
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
