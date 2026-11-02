import {
    DashboardTileTypes,
    type Dashboard,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    dashboardEditActions,
    dashboardFiltersActions,
    dashboardSourceActions,
    getDashboardContextView,
    initialDashboardProviderState,
} from '.';
import { createDashboardTestStore } from '../../../testing/dashboardStore';

const makeDashboard = (uuid: string): Dashboard => ({
    uuid,
    name: uuid,
    slug: uuid,
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    dashboardVersionId: 1,
    versionUuid: 'version-uuid',
    verification: null,
    updatedAt: new Date(0),
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    tabs: [],
    inheritsFromOrgOrProject: false,
    access: null,
    colorPaletteUuid: null,
    owner: null,
});

const dashboard = makeDashboard('dashboard-uuid');

const chartTile = (uuid: string, x: number): DashboardTile => ({
    uuid,
    tabUuid: undefined,
    type: DashboardTileTypes.SAVED_CHART,
    x,
    y: 0,
    w: 6,
    h: 3,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title: uuid,
        belongsToDashboard: false,
    },
});

describe('dashboard context view', () => {
    it('keeps the same object until a value it exposes changes', () => {
        const store = createDashboardTestStore();
        const view = getDashboardContextView(store);
        const before = view(store.getState());

        store.dispatch(dashboardFiltersActions.setHaveFiltersChanged(true));
        expect(view(store.getState())).toBe(before);

        store.dispatch(
            dashboardSourceActions.sync({
                ...initialDashboardProviderState,
                queryDashboard: dashboard,
            }),
        );
        const after = view(store.getState());
        expect(after).not.toBe(before);
        expect(after.dashboard).toBe(dashboard);
        expect(after.setDashboardFilters).toBe(before.setDashboardFilters);
    });

    it('ignores a sync whose values are unchanged', () => {
        const store = createDashboardTestStore();
        const state = store.getState();
        store.dispatch(
            dashboardSourceActions.sync({ ...initialDashboardProviderState }),
        );
        expect(store.getState().source).toBe(state.source);
    });

    it('prefers the query dashboard over the embed one', () => {
        const store = createDashboardTestStore();
        const view = getDashboardContextView(store);
        const embedDashboard = makeDashboard('embed-uuid');
        view(store.getState()).setEmbedDashboard(embedDashboard);
        expect(view(store.getState()).dashboard).toBe(embedDashboard);

        store.dispatch(
            dashboardSourceActions.sync({
                ...initialDashboardProviderState,
                queryDashboard: dashboard,
            }),
        );
        expect(view(store.getState()).dashboard).toBe(dashboard);
    });

    it('keeps the filterable fields when a tile only moves', () => {
        const store = createDashboardTestStore();
        const view = getDashboardContextView(store);
        store.dispatch(dashboardEditActions.setTiles([chartTile('a', 0)]));
        store.dispatch(
            dashboardSourceActions.sync({
                ...initialDashboardProviderState,
                queryDashboard: dashboard,
                availableFilters: {
                    allFilterableFields: [],
                    allFilterableMetrics: [],
                    savedQueryFilters: {},
                    savedQueryMetricFilters: {},
                    hiddenFilterableFieldIds: [],
                },
            }),
        );
        const before = view(store.getState()).filterableFieldsByTileUuid;
        expect(before).toBeDefined();

        store.dispatch(dashboardEditActions.setTiles([chartTile('a', 6)]));
        expect(view(store.getState()).filterableFieldsByTileUuid).toBe(before);
    });
});
