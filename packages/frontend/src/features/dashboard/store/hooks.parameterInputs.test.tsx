import { type Dashboard } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardParametersActions } from '.';
import { createDashboardTestStore } from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { useTileDashboardParameterInputs } from './hooks';

const { flag } = vi.hoisted(() => ({ flag: { enabled: true } }));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: flag }),
}));

const render = (withControls: boolean) => {
    const store = createDashboardTestStore({
        parameterValues: { region: 'EU' },
        source: { queryDashboard: { uuid: 'dashboard' } as Dashboard },
        tileParameterReferences: { tile: ['region'] },
    });
    if (withControls) {
        store.dispatch(
            dashboardParametersActions.syncParameterControls({
                controls: [
                    {
                        id: 'region',
                        label: 'Region',
                        value: 'EU',
                        valueType: { type: 'string', multiple: false },
                        parameters: { region: { only: ['other'] } },
                    },
                ],
                isSaved: true,
            }),
        );
    }
    return renderHook(
        () => useTileDashboardParameterInputs('tile', { region: 'EU' }),
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <DashboardStoreTestProvider store={store}>
                    {children}
                </DashboardStoreTestProvider>
            ),
        },
    ).result.current;
};

describe('useTileDashboardParameterInputs', () => {
    afterEach(() => {
        sessionStorage.clear();
        flag.enabled = true;
    });
    it('reports the keys the tile keeps as its own when controls are active', () => {
        expect(render(true)).toMatchObject({
            dashboardValues: {},
            excludedParameterKeys: ['region'],
        });
    });

    it('reports no resolution with the flag off', () => {
        flag.enabled = false;
        expect(render(false)).toMatchObject({
            dashboardValues: { region: 'EU' },
            excludedParameterKeys: undefined,
        });
    });
    it('uses the injected values and exclusions only when the flag is enabled', () => {
        sessionStorage.setItem(
            'dashboardExportTileParameters:dashboard',
            JSON.stringify({
                tile: {
                    parameters: { region: 'US' },
                    excludedParameterKeys: ['week'],
                },
            }),
        );
        expect(render(true)).toMatchObject({
            dashboardValues: { region: 'US' },
            excludedParameterKeys: ['week'],
        });
        flag.enabled = false;
        expect(render(false)).toMatchObject({
            dashboardValues: { region: 'EU' },
            excludedParameterKeys: undefined,
        });
    });

    it('uses injected data with the flag on even before the control list is saved', () => {
        sessionStorage.setItem(
            'dashboardExportTileParameters:dashboard',
            JSON.stringify({
                tile: {
                    parameters: { region: 'US' },
                    excludedParameterKeys: [],
                },
            }),
        );
        expect(render(false)).toMatchObject({
            dashboardValues: { region: 'US' },
            excludedParameterKeys: [],
        });
    });

    it('ignores malformed session data', () => {
        sessionStorage.setItem('dashboardExportTileParameters:dashboard', '{');
        expect(render(true)).toMatchObject({
            dashboardValues: {},
            excludedParameterKeys: ['region'],
        });
        sessionStorage.setItem(
            'dashboardExportTileParameters:dashboard',
            JSON.stringify({
                tile: { parameters: {}, excludedParameterKeys: 5 },
            }),
        );
        expect(render(true)).toMatchObject({
            dashboardValues: {},
            excludedParameterKeys: ['region'],
        });
    });
});
