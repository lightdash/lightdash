import { SearchItemType, type SearchResults } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSearchItemMap } from './getSearchItemMap';

const emptyResults = {
    spaces: [],
    dashboards: [],
    dashboardTabs: [],
    savedCharts: [],
    sqlCharts: [],
    tables: [],
    fields: [],
    pages: [],
    dataApps: [],
} as SearchResults;

describe('getSearchItemMap', () => {
    it('uses dashboard slugs for dashboard and dashboard tab results', () => {
        const result = getSearchItemMap(
            {
                ...emptyResults,
                dashboards: [
                    {
                        uuid: 'dashboard-uuid',
                        slug: 'dashboard-slug',
                        name: 'Dashboard',
                    },
                ],
                dashboardTabs: [
                    {
                        uuid: 'tab-uuid',
                        name: 'Tab',
                        dashboardUuid: 'dashboard-uuid',
                        dashboardSlug: 'dashboard-slug',
                        dashboardName: 'Dashboard',
                        spaceUuid: 'space-uuid',
                    },
                ],
            } as SearchResults,
            'project-uuid',
        );

        expect(result.dashboards[0]).toMatchObject({
            type: SearchItemType.DASHBOARD,
            location: {
                pathname: '/projects/project-uuid/dashboards/dashboard-slug',
            },
        });
        expect(result.dashboardTabs[0]).toMatchObject({
            type: SearchItemType.DASHBOARD_TAB,
            location: {
                pathname:
                    '/projects/project-uuid/dashboards/dashboard-slug/view/tabs/tab-uuid',
            },
        });
    });
});
