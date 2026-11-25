import { describe, expect, it } from 'vitest';
import { getActiveAppSidebarItem } from './appSidebarNavigation';

describe('getActiveAppSidebarItem', () => {
    it('marks the destination a page belongs to', () => {
        expect(getActiveAppSidebarItem('/projects/jaffle/home')).toBe('home');
        expect(getActiveAppSidebarItem('/projects/jaffle/dashboards')).toBe(
            'dashboards',
        );
        expect(getActiveAppSidebarItem('/projects/jaffle/sql-runner')).toBe(
            'sqlRunner',
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
    });

    it('marks nothing on pages that are not a sidebar destination', () => {
        expect(getActiveAppSidebarItem('/generalSettings/profile')).toBeNull();
        expect(
            getActiveAppSidebarItem('/projects/jaffle/query-history'),
        ).toBeNull();
        expect(getActiveAppSidebarItem('/projects/jaffle')).toBeNull();
    });
});
