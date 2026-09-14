import { type ApiAppVersionSummary } from '@lightdash/common';
import { type QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
    invalidateDataAppVisualizationOnReady,
    mergePolledVersions,
} from './useAppBuildPoller';

const version = (n: number, status = 'ready'): ApiAppVersionSummary =>
    ({ version: n, status }) as ApiAppVersionSummary;

describe('mergePolledVersions', () => {
    it('keeps an already-loaded ready version while a newer one builds', () => {
        // The regression: replacing the page with the limit=1 poll evicted v1,
        // leaving the chart with no ready version to render mid-build.
        const merged = mergePolledVersions(
            [version(1, 'ready')],
            [version(2, 'building')],
        );
        expect(merged.map((v) => v.version)).toEqual([2, 1]);
        expect(merged.find((v) => v.status === 'ready')?.version).toBe(1);
    });

    it('lets the poll win for a version it already knows about', () => {
        const merged = mergePolledVersions(
            [version(2, 'building'), version(1, 'ready')],
            [version(2, 'ready')],
        );
        expect(merged).toHaveLength(2);
        expect(merged[0]).toEqual(version(2, 'ready'));
    });

    it('orders newest first', () => {
        const merged = mergePolledVersions(
            [version(1), version(3)],
            [version(2)],
        );
        expect(merged.map((v) => v.version)).toEqual([3, 2, 1]);
    });

    it('handles an empty cache', () => {
        expect(mergePolledVersions([], [version(1)])).toEqual([version(1)]);
    });

    it('handles an empty poll', () => {
        expect(mergePolledVersions([version(1)], [])).toEqual([version(1)]);
    });
});

describe('invalidateDataAppVisualizationOnReady', () => {
    it('refreshes the visualization contract after a ready build', () => {
        const invalidateQueries = vi.fn();

        invalidateDataAppVisualizationOnReady(
            { invalidateQueries } as unknown as QueryClient,
            'project-1',
            'app-1',
            version(2, 'ready'),
        );

        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['data-app-viz', 'project-1', 'app-1'],
        });
    });

    it('does not refresh the contract for an errored build', () => {
        const invalidateQueries = vi.fn();

        invalidateDataAppVisualizationOnReady(
            { invalidateQueries } as unknown as QueryClient,
            'project-1',
            'app-1',
            version(2, 'error'),
        );

        expect(invalidateQueries).not.toHaveBeenCalled();
    });
});
