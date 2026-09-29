import { type ApiAppVersionSummary } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    invalidateDataAppVisualizationOnReady,
    mergePolledVersions,
    useAppBuildPoller,
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
            'project',
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
            'project',
        );

        expect(invalidateQueries).not.toHaveBeenCalled();
    });
});

describe('useAppBuildPoller', () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
        messages: unknown[] = [];

        onmessage: ((event: MessageEvent) => void) | null = null;

        constructor() {
            workers.push(this);
        }

        postMessage(message: unknown) {
            this.messages.push(message);
        }

        terminate() {}
    }

    beforeEach(() => {
        workers.length = 0;
        vi.stubGlobal('Worker', FakeWorker);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:poller');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('polls an organization chart type through the organization routes', () => {
        const queryClient = new QueryClient();
        const setQueryData = vi.spyOn(queryClient, 'setQueryData');
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const onDone = vi.fn();
        const wrapper = ({ children }: PropsWithChildren) =>
            createElement(
                QueryClientProvider,
                { client: queryClient },
                children,
            );
        renderHook(
            () =>
                useAppBuildPoller(
                    'project-1',
                    'org-viz-1',
                    true,
                    onDone,
                    'organization',
                ),
            { wrapper },
        );

        const [worker] = workers;
        expect(worker.messages).toEqual([
            {
                type: 'start',
                url: `${window.location.origin}/api/v1/ee/org/chart-types/org-viz-1?limit=1`,
                interval: 3000,
            },
        ]);

        act(() =>
            worker.onmessage?.({
                data: {
                    type: 'data',
                    results: {
                        versions: [version(2, 'ready')],
                        hasMore: false,
                    },
                },
            } as MessageEvent),
        );

        expect(setQueryData).toHaveBeenCalledWith(
            ['organization-chart-type', 'org-viz-1'],
            expect.any(Function),
        );
        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: ['organization-chart-type', 'org-viz-1', 'schema'],
        });
        expect(onDone).toHaveBeenCalledWith(version(2, 'ready'));
    });
});
