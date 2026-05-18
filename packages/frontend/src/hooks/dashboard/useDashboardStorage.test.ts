import {
    DashboardTileTypes,
    type DashboardChartTile,
    type DashboardFilters,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useDashboardStorage from './useDashboardStorage';

const DASHBOARD_A_UUID = '01636314-fc83-4284-9b95-179de80ad22c';
const DASHBOARD_B_UUID = '429907e3-2c54-449d-99bc-7f577d98287b';

const makeTile = (uuid: string): DashboardChartTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 24,
    h: 9,
    tabUuid: undefined,
    properties: {
        title: '',
        hideTitle: false,
        savedChartUuid: 'chart-from-a',
        belongsToDashboard: true,
        chartName: 'A inline chart',
    },
});

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

describe('useDashboardStorage', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    it('isolates tiles by dashboardUuid so navigating to a different dashboard does not pick up another dashboards stored tiles', () => {
        const { result } = renderHook(() => useDashboardStorage());
        const aTile = makeTile('tile-from-a');

        act(() => {
            result.current.storeDashboard(
                [aTile],
                emptyFilters,
                true,
                false,
                DASHBOARD_A_UUID,
                'Dashboard A',
            );
        });

        expect(
            result.current.getUnsavedDashboardTiles(DASHBOARD_A_UUID),
        ).toEqual([aTile]);
        expect(
            result.current.getUnsavedDashboardTiles(DASHBOARD_B_UUID),
        ).toEqual([]);
    });

    it('writes namespaced sessionStorage keys (no flat unsavedDashboardTiles key)', () => {
        const { result } = renderHook(() => useDashboardStorage());

        act(() => {
            result.current.storeDashboard(
                [makeTile('tile-x')],
                emptyFilters,
                true,
                false,
                DASHBOARD_A_UUID,
                'Dashboard A',
            );
        });

        expect(sessionStorage.getItem('unsavedDashboardTiles')).toBeNull();
        expect(
            sessionStorage.getItem(`unsavedDashboardTiles:${DASHBOARD_A_UUID}`),
        ).not.toBeNull();
    });

    it('clearDashboardStorage only removes the namespaced keys belonging to the source dashboard', () => {
        const { result } = renderHook(() => useDashboardStorage());

        act(() => {
            result.current.storeDashboard(
                [makeTile('tile-from-a')],
                emptyFilters,
                true,
                false,
                DASHBOARD_A_UUID,
                'Dashboard A',
            );
            result.current.setUnsavedDashboardTiles(DASHBOARD_B_UUID, [
                makeTile('tile-from-b'),
            ]);
        });

        act(() => {
            result.current.clearDashboardStorage();
        });

        expect(
            result.current.getUnsavedDashboardTiles(DASHBOARD_A_UUID),
        ).toEqual([]);
        expect(
            result.current.getUnsavedDashboardTiles(DASHBOARD_B_UUID),
        ).toEqual([makeTile('tile-from-b')]);
    });

    it('storeDashboard is a no-op when dashboardUuid is missing', () => {
        const { result } = renderHook(() => useDashboardStorage());

        act(() => {
            result.current.storeDashboard(
                [makeTile('tile-x')],
                emptyFilters,
                true,
                false,
                undefined,
                'No dashboard',
            );
        });

        expect(sessionStorage.length).toBe(0);
    });

    it('getDashboardActiveTabUuid returns each dashboards own active tab', () => {
        const { result } = renderHook(() => useDashboardStorage());

        act(() => {
            result.current.storeDashboard(
                [makeTile('tile-a')],
                emptyFilters,
                true,
                false,
                DASHBOARD_A_UUID,
                'A',
                'tab-of-a',
            );
            result.current.storeDashboard(
                [makeTile('tile-b')],
                emptyFilters,
                true,
                false,
                DASHBOARD_B_UUID,
                'B',
                'tab-of-b',
            );
        });

        expect(result.current.getDashboardActiveTabUuid(DASHBOARD_A_UUID)).toBe(
            'tab-of-a',
        );
        expect(result.current.getDashboardActiveTabUuid(DASHBOARD_B_UUID)).toBe(
            'tab-of-b',
        );
    });
});
