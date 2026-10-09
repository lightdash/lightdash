import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { EventName } from '../../../types/Events';
import {
    getFilterLockKey,
    getFilterLockLabel,
    getFilterLockToggle,
} from './filterLock';

const rule: DashboardFilterRule = {
    id: 'a',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

describe('getFilterLockToggle', () => {
    it('locks on the active tab and reports it', () => {
        expect(
            getFilterLockToggle(rule, {
                isLocked: false,
                hasTabs: true,
                activeTabUuid: 't1',
                dashboardUuid: 'dashboard-1',
            }),
        ).toEqual({
            event: {
                name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                properties: {
                    action: 'lock',
                    dashboardUuid: 'dashboard-1',
                    tabUuid: 't1',
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
            filterRule: { ...rule, lockedTabUuids: ['t1'] },
        });
    });

    it('unlocks on the dashboard uuid when there are no tabs', () => {
        const toggle = getFilterLockToggle(
            { ...rule, lockedTabUuids: ['dashboard-1'] },
            {
                isLocked: true,
                hasTabs: false,
                activeTabUuid: undefined,
                dashboardUuid: 'dashboard-1',
            },
        );

        expect(toggle?.filterRule.lockedTabUuids).toBeUndefined();
        expect(toggle?.event.properties).toMatchObject({
            action: 'unlock',
            tabUuid: undefined,
        });
    });

    it('does nothing without a tab or dashboard to lock on', () => {
        const context = {
            isLocked: false,
            activeTabUuid: undefined,
            dashboardUuid: undefined,
        };

        expect(getFilterLockKey({ ...context, hasTabs: true })).toBeUndefined();
        expect(
            getFilterLockToggle(rule, { ...context, hasTabs: true }),
        ).toBeNull();
        expect(
            getFilterLockToggle(rule, { ...context, hasTabs: false }),
        ).toBeNull();
    });
});

describe('getFilterLockLabel', () => {
    it('names the action, per tab when the dashboard has tabs', () => {
        expect(getFilterLockLabel(false, true)).toBe('Lock filter on this tab');
        expect(getFilterLockLabel(true, true)).toBe(
            'Unlock filter on this tab',
        );
        expect(getFilterLockLabel(false, false)).toBe('Lock filter');
        expect(getFilterLockLabel(true, false)).toBe('Unlock filter');
    });
});
