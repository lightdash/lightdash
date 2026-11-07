import {
    DashboardTileTypes,
    type Dashboard,
    type DashboardConfig,
    type DashboardParameterControl,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { flag } = vi.hoisted(() => ({ flag: { enabled: true } }));
vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

import {
    dashboardEditActions,
    dashboardParametersActions,
} from '../../features/dashboard/store';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { useSyncParameterControls } from './useSyncParameterControls';

const savedControl = {
    id: 'saved-control',
    label: 'Region',
    value: 'EU',
    valueType: { type: 'string', multiple: false },
    parameters: { region: 'all' },
} satisfies DashboardParameterControl;
const savedConfig: DashboardConfig = {
    isDateZoomDisabled: false,
    parameterControls: [savedControl],
};
const savedList = [savedControl];

const mountHook = (
    store: ReturnType<typeof createDashboardTestStore>,
    config: DashboardConfig,
) =>
    renderHook(() =>
        useSyncParameterControls({
            store,
            config,
            dashboardParameters: {
                region: { parameterName: 'region', value: 'US' },
            },
            isDashboardLoaded: true,
        }),
    );

const discover = (
    tileUuid: string,
    savedChartUuid: string,
    references: string[],
    definitions = {},
) =>
    dashboardParametersActions.addDiscoveredParameterReferences({
        references: { [tileUuid]: references },
        definitions,
        sources: {
            [tileUuid]: JSON.stringify({
                tileUuid,
                savedChartUuid,
                savedSqlUuid: null,
            }),
        },
    });

const setup = (config: DashboardConfig) => {
    const store = createDashboardTestStore();
    store.dispatch(
        dashboardEditActions.setTiles([
            {
                uuid: 'tile-1',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { savedChartUuid: 'chart-1' },
            },
        ] as Dashboard['tiles']),
    );
    store.dispatch(discover('tile-1', 'chart-1', ['region']));
    renderHook(() =>
        useSyncParameterControls({
            store,
            config,
            dashboardParameters: {
                region: { parameterName: 'region', value: 'US' },
            },
            isDashboardLoaded: true,
        }),
    );
    return store;
};

describe('useSyncParameterControls', () => {
    beforeEach(() => {
        flag.enabled = true;
    });

    it('fills the list from the tiles when nothing is saved, and refills as tiles report', () => {
        const store = setup({ isDateZoomDisabled: false });
        const filled = store.getState().parameters;
        expect(filled.areParameterControlsSaved).toBe(false);
        const regionId = filled.parameterControls?.[0].id;
        expect(filled.parameterControls).toEqual([
            expect.objectContaining({
                value: 'US',
                label: null,
                parameters: { region: 'all' },
            }),
        ]);

        act(() => {
            store.dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid: 'tile-2',
                    references: ['status'],
                }),
            );
        });
        const refilled = store.getState().parameters.parameterControls;
        expect(
            refilled?.map(({ id, parameters }) => ({ id, parameters })),
        ).toEqual([
            { id: regionId, parameters: { region: 'all' } },
            { id: expect.any(String), parameters: { status: 'all' } },
        ]);
    });

    it('fills an empty dashboard with an empty list after its tiles load', () => {
        const store = createDashboardTestStore();
        mountHook(store, { isDateZoomDisabled: false });
        expect(store.getState().parameters.parameterControls).toBeNull();
        act(() => {
            store.dispatch(dashboardEditActions.setTiles([]));
        });
        expect(store.getState().parameters.parameterControls).toEqual([]);
    });

    it('continues using legacy values until discovery completes', () => {
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardEditActions.setTiles([
                {
                    uuid: 'a',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { savedChartUuid: 'chart-a' },
                },
            ] as Dashboard['tiles']),
        );
        mountHook(store, { isDateZoomDisabled: false });
        expect(store.getState().parameters.parameterControls).toBeNull();
        act(() => {
            store.dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid: 'a',
                    references: ['region'],
                }),
            );
        });
        expect(store.getState().parameters.parameterControls).toBeNull();
    });

    it('waits for every query tile before filling', () => {
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardEditActions.setTiles([
                {
                    uuid: 'a',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { savedChartUuid: 'chart-a' },
                },
                {
                    uuid: 'b',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { savedChartUuid: 'chart-b' },
                },
            ] as Dashboard['tiles']),
        );
        store.dispatch(discover('a', 'chart-a', ['region']));
        mountHook(store, { isDateZoomDisabled: false });
        expect(store.getState().parameters.parameterControls).toBeNull();
        act(() => {
            store.dispatch(
                discover('b', 'chart-b', ['status'], {
                    status: { label: 'Status', type: 'number', multiple: true },
                }),
            );
        });
        expect(
            store
                .getState()
                .parameters.parameterControls?.map(({ parameters }) =>
                    Object.keys(parameters),
                ),
        ).toEqual([['region'], ['status']]);
        expect(
            store.getState().parameters.parameterControls?.[1].valueType,
        ).toEqual({ type: 'number', multiple: true });
    });

    it('waits for new discovery when a tile changes its chart', () => {
        const store = setup({ isDateZoomDisabled: false });
        expect(store.getState().parameters.parameterControls).not.toBeNull();
        act(() => {
            store.dispatch(
                dashboardEditActions.setTiles([
                    {
                        uuid: 'tile-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { savedChartUuid: 'replacement' },
                    },
                ] as Dashboard['tiles']),
            );
        });
        expect(store.getState().parameters.parameterControls).toBeNull();
        act(() => {
            store.dispatch(
                discover('tile-1', 'replacement', ['new_key'], {
                    new_key: { label: 'New', type: 'date' },
                }),
            );
        });
        expect(
            store
                .getState()
                .parameters.parameterControls?.map(
                    ({ parameters, valueType }) => ({ parameters, valueType }),
                ),
        ).toEqual([
            {
                parameters: { new_key: 'all' },
                valueType: { type: 'date', multiple: false },
            },
        ]);
    });

    it('refills value types as definitions arrive, keeping ids', () => {
        const store = setup({ isDateZoomDisabled: false });
        const [filled] = store.getState().parameters.parameterControls!;
        act(() => {
            store.dispatch(
                dashboardParametersActions.addParameterDefinitions({
                    region: { label: 'Region', type: 'number', multiple: true },
                }),
            );
        });
        expect(store.getState().parameters.parameterControls).toEqual([
            { ...filled, valueType: { type: 'number', multiple: true } },
        ]);
    });

    it('seeds the saved list as it is', () => {
        const store = setup(savedConfig);
        expect(store.getState().parameters.parameterControls).toEqual(
            savedList,
        );
        expect(store.getState().parameters.areParameterControlsSaved).toBe(
            true,
        );
    });

    it('seeds nothing with the flag off', () => {
        flag.enabled = false;
        const store = setup(savedConfig);
        expect(store.getState().parameters.parameterControls).toBeNull();
    });

    it('stops using seeded controls when the flag goes off on a mounted dashboard, and seeds again when it returns', () => {
        const store = createDashboardTestStore();
        const hook = mountHook(store, savedConfig);
        expect(store.getState().parameters.parameterControls).toEqual(
            savedList,
        );

        flag.enabled = false;
        hook.rerender();
        expect(store.getState().parameters.parameterControls).toBeNull();
        expect(store.getState().parameters.areParameterControlsSaved).toBe(
            false,
        );

        flag.enabled = true;
        hook.rerender();
        expect(store.getState().parameters.parameterControls).toEqual(
            savedList,
        );
    });
});
