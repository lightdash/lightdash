import { DateGranularity, type DateZoomConfig } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { type FC, type MouseEvent, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { useZoomTileHover } from './useTileHover';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector({})),
}));

const config: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Order trend', granularity: DateGranularity.MONTH },
    ],
    tileTargets: {
        t1: { controlUuid: 'z1', fieldId: 'orders_date', tableName: 'orders' },
    },
};

const Wrapper: FC<PropsWithChildren> = ({ children }) => (
    <DashboardStoreTestProvider
        store={seedDashboardEditState(createDashboardTestStore(), {
            dateZoomConfig: config,
        })}
    >
        {children}
    </DashboardStoreTestProvider>
);

const isMarked = (tileUuid: string) =>
    document
        .querySelector(`[data-tile-uuid="${tileUuid}"]`)
        ?.hasAttribute('data-controls-hovered');

describe('useZoomTileHover', () => {
    const setHoveredFilterId = vi.fn();
    beforeEach(() => {
        setHoveredFilterId.mockClear();
        mockSidebar.current = {
            setHoveredFilterId,
            tileHoverOwner: { current: null },
        };
        document.body.innerHTML =
            '<div data-tile-uuid="t1"></div><div data-tile-uuid="t2"></div>';
    });

    it("marks the zoom's tiles while its pill is hovered", () => {
        const { result } = renderHook(() => useZoomTileHover(true), {
            wrapper: Wrapper,
        });
        const handlers = result.current('z1');
        act(() => handlers.onMouseEnter({ buttons: 0 } as MouseEvent));
        expect(isMarked('t1')).toBe(true);
        expect(isMarked('t2')).toBe(false);
        expect(setHoveredFilterId).toHaveBeenCalledWith('z1');

        act(() => handlers.onMouseLeave());
        expect(isMarked('t1')).toBe(false);
    });

    it('marks nothing while a control is edited', () => {
        const { result } = renderHook(() => useZoomTileHover(false), {
            wrapper: Wrapper,
        });
        act(() =>
            result.current('z1').onMouseEnter({ buttons: 0 } as MouseEvent),
        );
        expect(isMarked('t1')).toBe(false);
        expect(setHoveredFilterId).not.toHaveBeenCalled();
    });
});
