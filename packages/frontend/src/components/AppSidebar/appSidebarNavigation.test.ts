import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getActiveAppSidebarItem,
    getActiveFavoriteUuid,
} from './appSidebarNavigation';

describe('getActiveAppSidebarItem', () => {
    it('marks the destination a page belongs to', () => {
        expect(getActiveAppSidebarItem('/projects/jaffle/home')).toBe('home');
        expect(getActiveAppSidebarItem('/projects/jaffle/dashboards')).toBe(
            'dashboards',
        );
        expect(getActiveAppSidebarItem('/projects/jaffle/sql-runner')).toBe(
            'sqlRunner',
        );
        expect(getActiveAppSidebarItem('/projects/jaffle/chart-studio')).toBe(
            'chartStudio',
        );
        expect(getActiveAppSidebarItem('/projects/jaffle/autopilot')).toBe(
            'autopilot',
        );
    });

    it('keeps the destination active on the pages below it', () => {
        expect(
            getActiveAppSidebarItem(
                '/projects/jaffle/dashboards/revenue/view/tabs/overview',
            ),
        ).toBe('dashboards');
        expect(
            getActiveAppSidebarItem(
                '/projects/jaffle/saved/weekly-orders/edit',
            ),
        ).toBe('charts');
        expect(
            getActiveAppSidebarItem('/projects/jaffle/ai-agents/a1/threads/t1'),
        ).toBe('askAi');
        expect(
            getActiveAppSidebarItem('/projects/jaffle/review-requests/r1'),
        ).toBe('reviews');
        expect(
            getActiveAppSidebarItem(
                '/projects/jaffle/semantic-layer/models/orders',
            ),
        ).toBe('semanticLayer');
    });

    it('marks nothing on pages that are not a sidebar destination', () => {
        expect(getActiveAppSidebarItem('/generalSettings/profile')).toBeNull();
        expect(
            getActiveAppSidebarItem('/projects/jaffle/query-history'),
        ).toBeNull();
        expect(getActiveAppSidebarItem('/projects/jaffle')).toBeNull();
    });
});

describe('getActiveFavoriteUuid', () => {
    const favorite = (
        type: ResourceViewItemType,
        uuid: string,
        slug: string,
    ): ResourceViewItem =>
        // Only the identity of a favorite matters for matching its page.
        ({ type, data: { uuid, slug } }) as ResourceViewItem;

    const favorites = [
        favorite(ResourceViewItemType.DASHBOARD, 'd-1', 'revenue'),
        favorite(ResourceViewItemType.CHART, 'c-1', 'weekly-orders'),
    ];

    it('marks the favorite being viewed, on any page below it', () => {
        expect(
            getActiveFavoriteUuid(
                '/projects/jaffle/dashboards/revenue/view/tabs/overview',
                favorites,
            ),
        ).toBe('d-1');
        expect(
            getActiveFavoriteUuid(
                '/projects/jaffle/saved/weekly-orders/edit',
                favorites,
            ),
        ).toBe('c-1');
    });

    it('recognises a favorite opened by its id', () => {
        expect(
            getActiveFavoriteUuid('/projects/jaffle/dashboards/d-1', favorites),
        ).toBe('d-1');
    });

    it('marks nothing on a list page or on content that is not a favorite', () => {
        expect(
            getActiveFavoriteUuid('/projects/jaffle/dashboards', favorites),
        ).toBeNull();
        expect(
            getActiveFavoriteUuid(
                '/projects/jaffle/dashboards/costs/view',
                favorites,
            ),
        ).toBeNull();
        // A chart and a dashboard can share a slug.
        expect(
            getActiveFavoriteUuid('/projects/jaffle/saved/revenue', favorites),
        ).toBeNull();
    });
});
