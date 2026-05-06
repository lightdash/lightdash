import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';

export const MAX_HEXBIN_POINTS = 50_000;

export type LatLng = [number, number];

export type HexBin = {
    h3Index: string;
    count: number;
    /** Sum of value field across points in this bin. Null if no point in this bin had a numeric value. */
    sum: number | null;
    /**
     * One or more polygon rings. Most cells have a single ring, but cells that
     * cross the antimeridian (±180° longitude) are split into two so that each
     * half renders in the correct hemisphere instead of stretching across the map.
     */
    rings: LatLng[][];
    /** Cell centroid as [lat, lng]. */
    centroid: LatLng;
};

/**
 * Walk the ring once, shifting each vertex by ±360° as needed so neighbouring
 * vertices never differ in longitude by more than 180°. This unwraps a ring
 * that crosses the antimeridian into a contiguous range like [170, 190]
 * instead of [170, -170].
 */
const unwrapRing = (ring: LatLng[]): LatLng[] => {
    if (ring.length < 2) return ring;
    const result: LatLng[] = [ring[0]];
    let prevLng = ring[0][1];
    for (let i = 1; i < ring.length; i++) {
        let [lat, lng] = ring[i];
        while (lng - prevLng > 180) lng -= 360;
        while (lng - prevLng < -180) lng += 360;
        result.push([lat, lng]);
        prevLng = lng;
    }
    return result;
};

/**
 * Returns 1 ring for cells fully inside [-180, 180], or 2 rings (one shifted
 * by 360°) for cells that cross the antimeridian. The two-ring case lets the
 * caller render the cell in both hemispheres.
 */
export const splitAntimeridianRing = (ring: LatLng[]): LatLng[][] => {
    const unwrapped = unwrapRing(ring);
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const [, lng] of unwrapped) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
    }
    if (minLng >= -180 && maxLng <= 180) {
        return [unwrapped];
    }
    // Cell crosses the antimeridian — produce a second copy shifted into the
    // opposite hemisphere so the user sees both halves.
    const shift = maxLng > 180 ? -360 : 360;
    const shifted: LatLng[] = unwrapped.map(([lat, lng]) => [lat, lng + shift]);
    return [unwrapped, shifted];
};

export type HexbinResult = {
    bins: HexBin[];
    truncated: boolean;
    totalPoints: number;
};

export const computeHexbinsWithMeta = (
    points: ScatterPoint[],
    resolution: number,
): HexbinResult => {
    const truncated = points.length > MAX_HEXBIN_POINTS;
    const usedPoints = truncated ? points.slice(0, MAX_HEXBIN_POINTS) : points;

    const indexMap = new Map<
        string,
        { count: number; sum: number; sawNumeric: boolean }
    >();

    for (const p of usedPoints) {
        const idx = latLngToCell(p.lat, p.lon, resolution);
        const entry = indexMap.get(idx);
        const isNumeric = p.value !== null && !Number.isNaN(p.value);
        if (entry) {
            entry.count += 1;
            if (isNumeric) {
                entry.sum += p.value as number;
                entry.sawNumeric = true;
            }
        } else {
            indexMap.set(idx, {
                count: 1,
                sum: isNumeric ? (p.value as number) : 0,
                sawNumeric: isNumeric,
            });
        }
    }

    const bins: HexBin[] = [];
    for (const [h3Index, agg] of indexMap) {
        const rawBoundary = cellToBoundary(h3Index) as LatLng[];
        bins.push({
            h3Index,
            count: agg.count,
            sum: agg.sawNumeric ? agg.sum : null,
            rings: splitAntimeridianRing(rawBoundary),
            centroid: cellToLatLng(h3Index) as LatLng,
        });
    }

    return { bins, truncated, totalPoints: points.length };
};

/** Convenience wrapper for tests / call sites that don't need truncation metadata. */
export const computeHexbins = (
    points: ScatterPoint[],
    resolution: number,
): HexBin[] => computeHexbinsWithMeta(points, resolution).bins;
