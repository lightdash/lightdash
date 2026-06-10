import { describe, expect, it } from 'vitest';
import { getActiveTabForTabs } from './getActiveTabForTabs';

const tabs = [
    { uuid: 'overview', name: 'Overview', order: 0, hidden: false },
    { uuid: 'revenue', name: 'Revenue', order: 1, hidden: false },
    { uuid: 'orders', name: 'Orders', order: 2, hidden: false },
];

describe('getActiveTabForTabs', () => {
    it('uses the tab from the url when it exists', () => {
        expect(getActiveTabForTabs(tabs, 'orders', false, tabs[1])?.uuid).toBe(
            'orders',
        );
    });

    it('preserves current tab when no url tab exists', () => {
        expect(getActiveTabForTabs(tabs, undefined, false, tabs[1])?.uuid).toBe(
            'revenue',
        );
    });

    it('falls back only when there is no current tab', () => {
        expect(
            getActiveTabForTabs(tabs, undefined, false, undefined)?.uuid,
        ).toBe('overview');
    });
});
