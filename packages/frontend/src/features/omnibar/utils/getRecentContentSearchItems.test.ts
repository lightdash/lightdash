import {
    ContentType,
    SearchItemType,
    type ChartContent,
    type DashboardContent,
    type RecentContentEntry,
} from '@lightdash/common';
import { getRecentContentSearchItems } from './getRecentContentSearchItems';

describe('recently viewed omnibar items', () => {
    const dashboard = {
        contentType: ContentType.DASHBOARD,
        uuid: 'dashboard-uuid',
        slug: 'sales-dashboard',
        name: 'Sales dashboard',
        description: 'Sales overview',
        space: { name: 'Sales' },
        views: 12,
        verification: null,
    } as DashboardContent;
    const chart = {
        contentType: ContentType.CHART,
        uuid: 'chart-uuid',
        slug: 'monthly-sales',
        name: 'Monthly sales',
        description: null,
        space: { name: 'Sales' },
        views: 3,
        verification: null,
    } as ChartContent;
    const entries: RecentContentEntry[] = [
        {
            contentType: 'dashboard',
            uuid: dashboard.uuid,
            viewedAt: new Date(),
            content: dashboard,
        },
        {
            contentType: 'chart',
            uuid: chart.uuid,
            viewedAt: new Date(),
            content: chart,
        },
    ];

    it('keeps recency order across content types and navigates using project/content slugs', () => {
        const items = getRecentContentSearchItems(entries, 'jaffle-shop');
        expect(
            items.map((item) => [
                item.type,
                item.title,
                item.location.pathname,
            ]),
        ).toEqual([
            [
                SearchItemType.DASHBOARD,
                'Sales dashboard',
                '/projects/jaffle-shop/dashboards/sales-dashboard/view',
            ],
            [
                SearchItemType.CHART,
                'Monthly sales',
                '/projects/jaffle-shop/saved/monthly-sales/view',
            ],
        ]);
    });

    it('retains authorized metadata for previews without fabricating search results', () => {
        const items = getRecentContentSearchItems(entries, 'project-uuid');
        expect(items[0].recentContent).toBe(dashboard);
        expect(items[1].contextLabel).toBe('Sales');
        expect(items[1].description).toBeUndefined();
        expect(items[1].item).toBeUndefined();
    });

    it('handles an empty history', () => {
        expect(getRecentContentSearchItems([], 'project-uuid')).toEqual([]);
    });
});
