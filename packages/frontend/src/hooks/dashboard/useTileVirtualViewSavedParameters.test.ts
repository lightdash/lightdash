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
        renderHook(() => useTileVirtualViewSavedParameters('tile-1', explore));

        expect(setTileVirtualViewSavedParameters).toHaveBeenCalledWith(
            'tile-1',
            { status: 'Shipped' },
        );
    });

    it('clears earlier values once the explore is gone', () => {
        const { rerender } = renderHook(
            ({ current }) =>
                useTileVirtualViewSavedParameters('tile-1', current),
            {
                initialProps: {
                    current: explore as ApiExploreResults | undefined,
                },
            },
        );

        rerender({ current: undefined });

        expect(setTileVirtualViewSavedParameters).toHaveBeenLastCalledWith(
            'tile-1',
            {},
        );
    });

    it('reports nothing with dashboard controls off', () => {
        flag.enabled = false;

        renderHook(() => useTileVirtualViewSavedParameters('tile-1', explore));

        expect(setTileVirtualViewSavedParameters).not.toHaveBeenCalled();
    });
});
