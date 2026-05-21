import {
    cellToBoundary,
    cellToLatLng,
    gridDisk,
    latLngToCell,
    polygonToCells,
} from 'h3-js';
import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';

/**
 * Hard cap on how many empty cells we render in a single viewport. polygonToCells
 * is fast, but rendering tens of thousands of <Polygon>s in Leaflet's SVG renderer
 * is not. We pick 10k so the world view at h3 resolution 2 (~5,900 cells) fits
 * comfortably; finer resolutions over a global viewport bail rather than freeze.
 */
const MAX_EMPTY_CELLS_PER_VIEWPORT = 10_000;

export const MAX_HEXBIN_POINTS = 50_000;

export type LatLng = [number, number];

export type HexBin = {
    h3Index: string;
    count: number;
    /** Sum of the value field across points in this bin. Null when no point in
     *  this bin had a numeric value. */
    sum: number | null;
    /** Min of the value field across numeric points in this bin (null if none). */
    min: number | null;
    /** Max of the value field across numeric points in this bin (null if none). */
    max: number | null;
    /** Average of the value field across numeric points in this bin (null if none). */
    avg: number | null;
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

export type ComputeHexbinsOptions = {
    /** When true, also include the k=1 hex neighborhood around each populated
     *  bin as zero-count "empty" bins. Useful for giving sparse data context. */
    includeEmptyNeighbors?: boolean;
};

export const computeHexbinsWithMeta = (
    points: ScatterPoint[],
    resolution: number,
    options: ComputeHexbinsOptions = {},
): HexbinResult => {
    const truncated = points.length > MAX_HEXBIN_POINTS;
    const usedPoints = truncated ? points.slice(0, MAX_HEXBIN_POINTS) : points;

    type Agg = {
        count: number;
        sum: number;
        min: number;
        max: number;
        numericCount: number;
    };
    const indexMap = new Map<string, Agg>();

    for (const p of usedPoints) {
        const idx = latLngToCell(p.lat, p.lon, resolution);
        const entry = indexMap.get(idx);
        const isNumeric = p.value !== null && !Number.isNaN(p.value);
        const v = isNumeric ? (p.value as number) : 0;
        if (entry) {
            entry.count += 1;
            if (isNumeric) {
                entry.sum += v;
                entry.numericCount += 1;
                if (v < entry.min) entry.min = v;
                if (v > entry.max) entry.max = v;
            }
        } else {
            indexMap.set(idx, {
                count: 1,
                sum: isNumeric ? v : 0,
                min: isNumeric ? v : Infinity,
                max: isNumeric ? v : -Infinity,
                numericCount: isNumeric ? 1 : 0,
            });
        }
    }

    const bins: HexBin[] = [];
    for (const [h3Index, agg] of indexMap) {
        const rawBoundary = cellToBoundary(h3Index) as LatLng[];
        const hasNumeric = agg.numericCount > 0;
        bins.push({
            h3Index,
            count: agg.count,
            sum: hasNumeric ? agg.sum : null,
            min: hasNumeric ? agg.min : null,
            max: hasNumeric ? agg.max : null,
            avg: hasNumeric ? agg.sum / agg.numericCount : null,
            rings: splitAntimeridianRing(rawBoundary),
            centroid: cellToLatLng(h3Index) as LatLng,
        });
    }

    if (options.includeEmptyNeighbors) {
        bins.push(...computeEmptyNeighbors(bins));
    }

    return { bins, truncated, totalPoints: points.length };
};

/**
 * Given a set of populated bins, return one empty bin per cell in their k=1
 * neighborhood that isn't itself populated. Kept exported (no longer used by
 * HexbinLayer, which uses viewport fill instead) — useful as a fallback if
 * viewport fill ever proves too expensive.
 */
const computeEmptyNeighbors = (populatedBins: HexBin[]): HexBin[] => {
    const populated = new Set(populatedBins.map((b) => b.h3Index));
    const seenEmpty = new Set<string>();
    const empties: HexBin[] = [];
    for (const h3Index of populated) {
        for (const neighbor of gridDisk(h3Index, 1)) {
            if (populated.has(neighbor) || seenEmpty.has(neighbor)) continue;
            seenEmpty.add(neighbor);
            empties.push(emptyBinFor(neighbor));
        }
    }
    return empties;
};

// ─── Viewport-based empty-cell fill ────────────────────────────────────────

export type ViewportBounds = {
    /** South latitude */
    south: number;
    /** West longitude */
    west: number;
    /** North latitude */
    north: number;
    /** East longitude */
    east: number;
};

/** Build a HexBin entry for an empty (count=0) cell. */
const emptyBinFor = (h3Index: string): HexBin => ({
    h3Index,
    count: 0,
    sum: null,
    min: null,
    max: null,
    avg: null,
    rings: splitAntimeridianRing(cellToBoundary(h3Index) as LatLng[]),
    centroid: cellToLatLng(h3Index) as LatLng,
});

/**
 * Build a closed lat/lng rectangle ring suitable for h3-js polygonToCells
 * (isGeoJson=false). Order is counter-clockwise.
 */
const rectRing = (
    south: number,
    west: number,
    north: number,
    east: number,
): LatLng[] => [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
    [south, west],
];

/**
 * Enumerate H3 cells inside a rectangular viewport. Splits polygons that span
 * more than 180° of longitude — h3-js polygonToCells flips its interior/exterior
 * interpretation on near-world polygons and returns ~0 cells, which produces a
 * weirdly empty map at low zoom. Splitting into ≤180° halves sidesteps this
 * entirely (cells along the seam are deduplicated via the returned Set).
 */
const cellsInViewport = (
    south: number,
    west: number,
    north: number,
    east: number,
    resolution: number,
): string[] => {
    const lngSpan = east - west;
    if (lngSpan <= 180) {
        return polygonToCells(rectRing(south, west, north, east), resolution);
    }
    const mid = west + lngSpan / 2;
    const a = polygonToCells(rectRing(south, west, north, mid), resolution);
    const b = polygonToCells(rectRing(south, mid, north, east), resolution);
    return Array.from(new Set([...a, ...b]));
};

/**
 * Compute empty bins covering the visible map area at the given resolution.
 * Excludes any cell that's already populated. Returns an empty array if the
 * cell count would exceed MAX_EMPTY_CELLS_PER_VIEWPORT — bigger sets cause
 * Leaflet rendering to grind.
 */
export const computeViewportEmptyBins = (
    bounds: ViewportBounds,
    resolution: number,
    populated: ReadonlySet<string>,
): HexBin[] => {
    // Clamp to the world. At very low zoom Leaflet's getBounds can extend
    // beyond ±180° / ±90° — passing those to polygonToCells produces a
    // self-overlapping polygon that returns cells inconsistently along the
    // dateline. Clamping keeps the input well-formed.
    const south = Math.max(bounds.south, -85);
    const north = Math.min(bounds.north, 85);
    const west = Math.max(bounds.west, -180);
    const east = Math.min(bounds.east, 180);
    if (south >= north || west >= east) return [];

    const baseCells = cellsInViewport(south, west, north, east, resolution);
    if (baseCells.length > MAX_EMPTY_CELLS_PER_VIEWPORT) {
        return [];
    }

    // Expand by one ring of neighbors so cells whose centroid sits just past
    // the viewport edge still render — without this you get visible gaps at
    // the screen border where partial hexes should be visible.
    const expanded = new Set<string>(baseCells);
    for (const cell of baseCells) {
        for (const neighbor of gridDisk(cell, 1)) {
            expanded.add(neighbor);
        }
    }

    const empties: HexBin[] = [];
    for (const cell of expanded) {
        if (populated.has(cell)) continue;
        empties.push(emptyBinFor(cell));
    }
    return empties;
};

/** Convenience wrapper for tests / call sites that don't need truncation metadata. */
export const computeHexbins = (
    points: ScatterPoint[],
    resolution: number,
): HexBin[] => computeHexbinsWithMeta(points, resolution).bins;
