import { type ApiExploreResults } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

const { flag, setTileVirtualViewSavedParameters } = vi.hoisted(() => ({
    flag: { enabled: true },
    setTileVirtualViewSavedParameters: vi.fn(),
}));
vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({ setTileVirtualViewSavedParameters }),
}));

import { useTileVirtualViewSavedParameters } from './useTileVirtualViewSavedParameters';

const explore = {
    savedParameterValues: { status: 'Shipped' },
} as unknown as ApiExploreResults;

describe('useTileVirtualViewSavedParameters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    it("reports the explore's saved values with dashboard controls on", () => {
        renderHook(() =>
            useTileVirtualViewSavedParameters('tile-1', explore, false),
        );

        expect(setTileVirtualViewSavedParameters).toHaveBeenCalledWith(
            'tile-1',
            { status: 'Shipped' },
            false,
        );
    });

    it('reports nothing while the explore is loading', () => {
        renderHook(() =>
            useTileVirtualViewSavedParameters('tile-1', undefined, false),
        );

        expect(setTileVirtualViewSavedParameters).not.toHaveBeenCalled();
    });

    it('reports an empty map for an explore without saved values', () => {
        renderHook(() =>
            useTileVirtualViewSavedParameters(
                'tile-1',
                {} as unknown as ApiExploreResults,
                false,
            ),
        );

        expect(setTileVirtualViewSavedParameters).toHaveBeenCalledWith(
            'tile-1',
            {},
            false,
        );
    });

    it("reports a merged chart's primary explore values as a partial answer", () => {
        renderHook(() =>
            useTileVirtualViewSavedParameters('tile-1', explore, true),
        );

        expect(setTileVirtualViewSavedParameters).toHaveBeenCalledWith(
            'tile-1',
            { status: 'Shipped' },
            true,
        );
    });

    it('reports again in full when the chart is no longer merged', () => {
        const { rerender } = renderHook(
            ({ isMergedChart }) =>
                useTileVirtualViewSavedParameters(
                    'tile-1',
                    explore,
                    isMergedChart,
                ),
            { initialProps: { isMergedChart: true } },
        );
        rerender({ isMergedChart: false });

        expect(setTileVirtualViewSavedParameters).toHaveBeenLastCalledWith(
            'tile-1',
            { status: 'Shipped' },
            false,
        );
    });

    it('reports nothing with dashboard controls off', () => {
        flag.enabled = false;

        renderHook(() =>
            useTileVirtualViewSavedParameters('tile-1', explore, false),
        );

        expect(setTileVirtualViewSavedParameters).not.toHaveBeenCalled();
    });
});
