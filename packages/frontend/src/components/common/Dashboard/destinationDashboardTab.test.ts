import { type DashboardTab } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDestinationDashboardTab } from './destinationDashboardTab';

const tabs: DashboardTab[] = [
    { uuid: 'third', name: 'Third', order: 2 },
    { uuid: 'first', name: 'First', order: 0 },
    { uuid: 'second', name: 'Second', order: 1 },
];

describe('getDestinationDashboardTab', () => {
    it('adds the tile to the tab the user picked', () => {
        expect(
            getDestinationDashboardTab({
                tabs,
                selectedTabUuid: 'third',
                lastActiveTabUuid: 'second',
            })?.uuid,
        ).toBe('third');
    });

    it('defaults to the tab the user last had open on the dashboard', () => {
        expect(
            getDestinationDashboardTab({
                tabs,
                selectedTabUuid: null,
                lastActiveTabUuid: 'second',
            })?.uuid,
        ).toBe('second');
    });

    it('defaults to the first tab when the user never opened the dashboard', () => {
        expect(
            getDestinationDashboardTab({
                tabs,
                selectedTabUuid: null,
                lastActiveTabUuid: null,
            })?.uuid,
        ).toBe('first');
    });

    it('ignores a pick that belongs to another dashboard', () => {
        expect(
            getDestinationDashboardTab({
                tabs,
                selectedTabUuid: 'tab-from-another-dashboard',
                lastActiveTabUuid: 'deleted-tab',
            })?.uuid,
        ).toBe('first');
    });

    it('has no destination tab on a dashboard without tabs', () => {
        expect(
            getDestinationDashboardTab({
                tabs: [],
                selectedTabUuid: null,
                lastActiveTabUuid: null,
            }),
        ).toBeNull();
    });
});
