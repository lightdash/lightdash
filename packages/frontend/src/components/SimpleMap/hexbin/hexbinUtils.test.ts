import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';
import {
    computeHexbins,
    computeHexbinsWithMeta,
    computeViewportEmptyBins,
    MAX_HEXBIN_POINTS,
    splitAntimeridianRing,
    type LatLng,
} from './hexbinUtils';

const mkPoint = (
    lat: number,
    lon: number,
    value: number | null = null,
): ScatterPoint => ({
    lat,
    lon,
    value,
    stringValue: null,
    displayValue: value ?? 1,
    sizeValue: 1,
    rowData: {},
});

describe('computeHexbins', () => {
    it('returns empty array for no points', () => {
        const bins = computeHexbins([], 7);
        expect(bins).toEqual([]);
    });

    it('groups points in the same cell into one bin with count', () => {
        // Two points within a few meters of each other at res 9
        const points = [
            mkPoint(40.7128, -74.006),
            mkPoint(40.71281, -74.00601),
        ];
        const bins = computeHexbins(points, 9);
        expect(bins).toHaveLength(1);
        expect(bins[0].count).toBe(2);
        expect(bins[0].sum).toBeNull();
    });

    it('separates distant points into different bins', () => {
        const points = [mkPoint(40.7128, -74.006), mkPoint(34.0522, -118.2437)]; // NYC + LA
        const bins = computeHexbins(points, 7);
        expect(bins).toHaveLength(2);
    });

    it('sums numeric values when value points provided', () => {
        const points = [
            mkPoint(40.7128, -74.006, 10),
            mkPoint(40.71281, -74.00601, 5),
        ];
        const bins = computeHexbins(points, 9);
        expect(bins[0].sum).toBe(15);
    });

    it('treats null values as 0 contribution to sum', () => {
        const points = [
            mkPoint(40.7128, -74.006, 10),
            mkPoint(40.71281, -74.00601, null),
        ];
        const bins = computeHexbins(points, 9);
        expect(bins[0].sum).toBe(10);
        expect(bins[0].count).toBe(2);
    });

    it('returns rings as array of polygon rings of [lat, lng] tuples', () => {
        const bins = computeHexbins([mkPoint(40.7128, -74.006)], 9);
        expect(bins[0].rings).toHaveLength(1);
        expect(bins[0].rings[0].length).toBeGreaterThanOrEqual(6);
        expect(bins[0].rings[0][0]).toHaveLength(2);
    });

    it('splits cells crossing the antimeridian into two rings', () => {
        // A cell at the equator near the antimeridian (lng ~179.9°) is virtually
        // guaranteed to cross ±180° at coarse resolutions. Resolution 1 cells
        // are ~400km on a side, large enough to straddle.
        const bins = computeHexbins([mkPoint(0, 179.9)], 1);
        expect(bins).toHaveLength(1);
        expect(bins[0].rings.length).toBe(2);
    });

    it('returns centroid lat/lng', () => {
        const bins = computeHexbins([mkPoint(40.7128, -74.006)], 9);
        expect(typeof bins[0].centroid[0]).toBe('number');
        expect(typeof bins[0].centroid[1]).toBe('number');
    });

    it('adds k=1 neighbor cells as count-0 bins when includeEmptyNeighbors is set', () => {
        // One isolated point at res 7 should yield 1 populated bin + 6 empty
        // neighbor bins (h3 cells have 6 neighbors at non-pentagon locations).
        const { bins } = computeHexbinsWithMeta(
            [mkPoint(40.7128, -74.006)],
            7,
            { includeEmptyNeighbors: true },
        );
        const populated = bins.filter((b) => b.count > 0);
        const empty = bins.filter((b) => b.count === 0);
        expect(populated).toHaveLength(1);
        expect(empty).toHaveLength(6);
        expect(empty.every((b) => b.sum === null)).toBe(true);
    });

    it('does not include neighbors when includeEmptyNeighbors is unset', () => {
        const { bins } = computeHexbinsWithMeta([mkPoint(40.7128, -74.006)], 7);
        expect(bins).toHaveLength(1);
        expect(bins[0].count).toBe(1);
    });

    it('truncates input above MAX_HEXBIN_POINTS', () => {
        const points = Array.from({ length: MAX_HEXBIN_POINTS + 100 }, (_, i) =>
            mkPoint(40 + i * 0.0001, -74),
        );
        const bins = computeHexbins(points, 9);
        const total = bins.reduce((acc, b) => acc + b.count, 0);
        expect(total).toBe(MAX_HEXBIN_POINTS);
    });
});

describe('computeViewportEmptyBins', () => {
    const populated = new Set<string>();

    it('returns cells covering the viewport, excluding populated', () => {
        const empties = computeViewportEmptyBins(
            { south: 40, west: -75, north: 41, east: -73 },
            5,
            populated,
        );
        expect(empties.length).toBeGreaterThan(0);
        const ids = new Set(empties.map((b) => b.h3Index));
        expect(ids.size).toBe(empties.length);
    });

    it('omits a populated cell from the empties', () => {
        const sample = computeViewportEmptyBins(
            { south: 40, west: -75, north: 41, east: -73 },
            5,
            new Set(),
        );
        const populatedOne = new Set([sample[0].h3Index]);
        const filtered = computeViewportEmptyBins(
            { south: 40, west: -75, north: 41, east: -73 },
            5,
            populatedOne,
        );
        expect(
            filtered.find((b) => b.h3Index === sample[0].h3Index),
        ).toBeUndefined();
        expect(filtered.length).toBe(sample.length - 1);
    });

    it('handles near-world viewports without inverting the polygon', () => {
        // Polygons spanning > 180° of longitude trip an h3-js bug where it
        // returns cells outside the polygon. cellsInViewport must split.
        const empties = computeViewportEmptyBins(
            { south: 5, west: -65, north: 85, east: 155 },
            1,
            new Set(),
        );
        // At res 1 there are 842 cells globally; this viewport covers ~⅓.
        expect(empties.length).toBeGreaterThan(50);
    });
});

describe('splitAntimeridianRing', () => {
    it('returns one ring unchanged when fully inside [-180, 180]', () => {
        const ring: LatLng[] = [
            [0, 10],
            [0, 20],
            [10, 15],
        ];
        const result = splitAntimeridianRing(ring);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(ring);
    });

    it('produces two rings when the input crosses ±180°', () => {
        const ring: LatLng[] = [
            [0, 179],
            [0, -179],
            [10, -179],
            [10, 179],
        ];
        const result = splitAntimeridianRing(ring);
        expect(result).toHaveLength(2);
        // One ring must be in the eastern hemisphere, the other in the western.
        const eastMax = Math.max(...result[0].map(([, lng]) => lng));
        const westMin = Math.min(...result[1].map(([, lng]) => lng));
        expect(eastMax).toBeGreaterThan(0);
        expect(westMin).toBeLessThan(0);
    });
});
