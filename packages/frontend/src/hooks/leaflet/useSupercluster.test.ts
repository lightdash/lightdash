import L from 'leaflet';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ScatterPoint } from './useLeafletMapConfig';
import useSupercluster from './useSupercluster';

const makePoint = (
    lat: number,
    lon: number,
    overrides: Partial<ScatterPoint> = {},
): ScatterPoint => ({
    lat,
    lon,
    value: 1,
    stringValue: null,
    displayValue: 1,
    sizeValue: 1,
    rowData: {},
    ...overrides,
});

// Texas-area points clustered around Austin (30.27, -97.74)
const makeAustinCluster = (count: number): ScatterPoint[] =>
    Array.from({ length: count }, () =>
        makePoint(
            30.27 + (Math.random() - 0.5) * 0.01,
            -97.74 + (Math.random() - 0.5) * 0.01,
        ),
    );

describe('useSupercluster', () => {
    it('returns all points unclustered when bounds is null', () => {
        const points = [
            makePoint(30.27, -97.74),
            makePoint(32.78, -96.8),
            makePoint(29.76, -95.37),
        ];

        const { result } = renderHook(() =>
            useSupercluster(points, 5, null),
        );

        expect(result.current).toHaveLength(3);
        expect(result.current.every((item) => item.type === 'point')).toBe(
            true,
        );
    });

    it('returns individual points when far apart at high zoom', () => {
        // Austin, Dallas, Houston — far apart
        const points = [
            makePoint(30.27, -97.74),
            makePoint(32.78, -96.8),
            makePoint(29.76, -95.37),
        ];

        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster(points, 10, bounds),
        );

        // At zoom 10, these cities are far enough apart to be individual points
        expect(result.current.every((item) => item.type === 'point')).toBe(
            true,
        );
        expect(result.current).toHaveLength(3);
    });

    it('clusters nearby points at low zoom', () => {
        // 50 points clustered tightly around Austin
        const points = makeAustinCluster(50);

        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster(points, 3, bounds),
        );

        // At zoom 3, 50 nearby points should cluster into 1 cluster
        const clusters = result.current.filter(
            (item) => item.type === 'cluster',
        );
        expect(clusters.length).toBeGreaterThanOrEqual(1);
        expect(result.current.length).toBeLessThan(50);
    });

    it('cluster has correct pointCount', () => {
        const points = makeAustinCluster(100);

        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster(points, 2, bounds),
        );

        const clusters = result.current.filter(
            (item) => item.type === 'cluster',
        );
        const totalClusteredPoints = clusters.reduce(
            (sum, c) => (c.type === 'cluster' ? sum + c.pointCount : sum),
            0,
        );
        const individualPoints = result.current.filter(
            (item) => item.type === 'point',
        ).length;

        // All 100 points should be accounted for
        expect(totalClusteredPoints + individualPoints).toBe(100);
    });

    it('cluster has expansionZoom property', () => {
        const points = makeAustinCluster(50);

        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster(points, 2, bounds),
        );

        const cluster = result.current.find(
            (item) => item.type === 'cluster',
        );
        expect(cluster).toBeDefined();
        if (cluster && cluster.type === 'cluster') {
            expect(cluster.expansionZoom).toBeGreaterThan(2);
            expect(cluster.lat).toBeCloseTo(30.27, 0);
            expect(cluster.lon).toBeCloseTo(-97.74, 0);
        }
    });

    it('preserves original point data for individual points', () => {
        const points = [
            makePoint(30.27, -97.74, {
                value: 42,
                stringValue: 'Retail',
                displayValue: '$42',
            }),
        ];

        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster(points, 10, bounds),
        );

        expect(result.current).toHaveLength(1);
        const item = result.current[0];
        expect(item.type).toBe('point');
        if (item.type === 'point') {
            expect(item.point.value).toBe(42);
            expect(item.point.stringValue).toBe('Retail');
            expect(item.point.displayValue).toBe('$42');
        }
    });

    it('handles empty scatter data', () => {
        const bounds = L.latLngBounds(
            L.latLng(25.84, -106.65),
            L.latLng(36.5, -93.51),
        );

        const { result } = renderHook(() =>
            useSupercluster([], 5, bounds),
        );

        expect(result.current).toHaveLength(0);
    });
});
