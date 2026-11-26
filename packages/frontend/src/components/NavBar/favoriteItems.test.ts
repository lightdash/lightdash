import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getActiveFavoriteUuid } from './favoriteItems';

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
