import type { ScatterPoint } from '../../../hooks/leaflet/useLeafletMapConfig';
import {
    computeHexbins,
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

    it('truncates input above MAX_HEXBIN_POINTS', () => {
        const points = Array.from({ length: MAX_HEXBIN_POINTS + 100 }, (_, i) =>
            mkPoint(40 + i * 0.0001, -74),
        );
        const bins = computeHexbins(points, 9);
        const total = bins.reduce((acc, b) => acc + b.count, 0);
        expect(total).toBe(MAX_HEXBIN_POINTS);
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
