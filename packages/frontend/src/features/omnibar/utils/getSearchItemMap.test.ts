import { SearchItemType, type SearchResults } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSearchItemMap } from './getSearchItemMap';

const emptyResults = {
    spaces: [],
    documents: [],
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
    it('maps documents to their slug URL with searchable metadata', () => {
        const document = {
            uuid: 'document-uuid',
            slug: 'quarterly-report',
            name: 'Quarterly report',
            description: 'Revenue and retention',
            projectUuid: 'project-uuid',
            spaceUuid: 'space-uuid',
            createdBy: null,
            search_rank: 0.75,
        };
        const result = getSearchItemMap(
            { ...emptyResults, documents: [document] },
            'project-uuid',
            'project-slug',
        );
        expect(result.documents).toEqual([
            {
                type: SearchItemType.DOCUMENT,
                title: document.name,
                description: document.description,
                item: document,
                searchRank: document.search_rank,
                location: {
                    pathname:
                        '/projects/project-slug/documents/quarterly-report',
                },
            },
        ]);
    });

    it('uses the project URL identifier for core content results', () => {
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
                spaces: [
                    {
                        uuid: 'space-uuid',
                        name: 'Space',
                    },
                ],
                savedCharts: [
                    {
                        uuid: 'chart-uuid',
                        slug: 'chart-slug',
                        name: 'Chart',
                    },
                ],
            } as SearchResults,
            'project-uuid',
            'project-slug',
        );

        expect(result.dashboards[0]).toMatchObject({
            type: SearchItemType.DASHBOARD,
            location: {
                pathname: '/projects/project-slug/dashboards/dashboard-slug',
            },
        });
        expect(result.dashboardTabs[0]).toMatchObject({
            type: SearchItemType.DASHBOARD_TAB,
            location: {
                pathname:
                    '/projects/project-slug/dashboards/dashboard-slug/view/tabs/tab-uuid',
            },
        });
        expect(result.spaces[0].location.pathname).toBe(
            '/projects/project-slug/spaces/space-uuid',
        );
        expect(result.savedCharts[0].location.pathname).toBe(
            '/projects/project-slug/saved/chart-slug',
        );
    });
});
