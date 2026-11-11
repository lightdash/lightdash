import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

import {
    dashboardEditActions,
    dashboardParametersActions,
    selectAreParameterControlsSaved,
    selectDashboardParameters,
    selectHaveParameterControlsChanged,
    selectParameterControls,
    selectParameterPicks,
} from '../../features/dashboard/store';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { getControlsToSave } from '../../utils/dashboardConfig';
import { useSyncParameterControls } from './useSyncParameterControls';

describe('parameter control defaults on a dashboard without saved controls', () => {
    it('keeps a filled control without a dashboard value null through an edit and save, never copying the default', () => {
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
        // The project defines a default; the dashboard never stored a value
        store.dispatch(
            dashboardParametersActions.addDiscoveredParameterReferences({
                chartSavedValues: {},
                virtualViewSavedValues: {},
                references: { 'tile-1': ['region'] },
                definitions: { region: { label: 'Region', default: 'EMEA' } },
                sources: {
                    'tile-1': JSON.stringify({
                        tileUuid: 'tile-1',
                        savedChartUuid: 'chart-1',
                        savedSqlUuid: null,
                    }),
                },
            }),
        );
        renderHook(() =>
            useSyncParameterControls({
                store,
                config: { isDateZoomDisabled: false },
                dashboardParameters: {},
                isDashboardLoaded: true,
            }),
        );

        // Any edit to the controls (a move, a section change) marks the filled list as changed
        act(() => {
            store.dispatch(
                dashboardParametersActions.setParameterControls(
                    selectParameterControls(store.getState())!,
                ),
            );
        });

        const state = store.getState();
        const saved = getControlsToSave({
            controlOrder: undefined,
            hasControlOrderChanged: false,
            dimensions: [],
            metrics: [],
            controlSections: [],
            haveControlSectionsChanged: false,
            dateZoomControls: [],
            parameterInputs: {
                parameterControls: selectParameterControls(state),
                areParameterControlsSaved:
                    selectAreParameterControlsSaved(state),
                haveParameterControlsChanged:
                    selectHaveParameterControlsChanged(state),
                existingParameterControls: null,
                parameterPicks: selectParameterPicks(state),
                appliedParameters: selectDashboardParameters(state),
                savedParameters: {},
            },
        });

        expect(saved.parameterControlsToSave).toEqual([
            expect.objectContaining({
                parameters: { region: 'all' },
                value: null,
            }),
        ]);
        expect(saved.parameters).toEqual({});
    });
});
