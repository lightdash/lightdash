import {
    DashboardTileTypes,
    type DashboardTile,
    type ParameterDefinitions,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getActiveTabParameters } from './useActiveTabParameters';

const tile = (uuid: string, tabUuid: string): DashboardTile => ({
    uuid,
    tabUuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 1,
    w: 1,
    properties: { savedChartUuid: uuid },
});

const parameterDefinitions: ParameterDefinitions = {
    kpi_metric: { label: 'KPI metric', options: ['revenue'] },
    region: { label: 'Region', options: ['EU'] },
};

// Every tile that has rendered reports its references, so they accumulate
// across tabs once the user has visited them
const tileParameterReferences = {
    'tile-tab-1': ['kpi_metric'],
    'tile-tab-2': ['region'],
};

const dashboardParameterReferences = new Set(['kpi_metric', 'region']);

describe('getActiveTabParameters', () => {
    it('only keeps parameters referenced by tiles on the active tab', () => {
        expect(
            Object.keys(
                getActiveTabParameters({
                    activeTiles: [tile('tile-tab-1', 'tab-1')],
                    parameterDefinitions,
                    tileParameterReferences,
                    dashboardParameterReferences,
                }),
            ),
        ).toEqual(['kpi_metric']);
    });

    it('drops parameters only referenced by tiles on other tabs', () => {
        expect(
            Object.keys(
                getActiveTabParameters({
                    activeTiles: [tile('tile-tab-2', 'tab-2')],
                    parameterDefinitions,
                    tileParameterReferences,
                    dashboardParameterReferences,
                }),
            ),
        ).toEqual(['region']);
    });

    it('shows nothing when no tile on the active tab uses a parameter', () => {
        expect(
            getActiveTabParameters({
                activeTiles: [tile('tile-tab-3', 'tab-3')],
                parameterDefinitions,
                tileParameterReferences,
                dashboardParameterReferences,
            }),
        ).toEqual({});
    });

    it('falls back to all referenced parameters when tiles are unknown', () => {
        expect(
            Object.keys(
                getActiveTabParameters({
                    activeTiles: undefined,
                    parameterDefinitions,
                    tileParameterReferences,
                    dashboardParameterReferences,
                }),
            ),
        ).toEqual(['kpi_metric', 'region']);
    });
});
