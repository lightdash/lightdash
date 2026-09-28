import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    excludeLockedFilterRequirements,
    isLockedDashboardFilterRule,
} from './lockedFilters';

const statusField = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    table: 'orders',
} as unknown as DashboardFilterableField;

const rule = (
    id: string,
    target: DashboardFilterRule['target'],
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id,
    target,
    tileTargets,
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    required: true,
    label: undefined,
});

const availability = {
    filterableFieldsByTileUuid: { 'tile-1': [statusField] },
    hiddenFilterableFieldIds: new Set(['orders_hidden']),
};

describe('isLockedDashboardFilterRule', () => {
    it('locks a rule on a hidden field that no tile offers', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_hidden', tableName: 'orders' }),
                availability,
            ),
        ).toBe(true);
    });

    it('does not lock a rule whose field or tile mapping a tile offers', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_status', tableName: 'orders' }),
                availability,
            ),
        ).toBe(false);
        expect(
            isLockedDashboardFilterRule(
                rule(
                    'a',
                    { fieldId: 'orders_hidden', tableName: 'orders' },
                    {
                        'tile-1': {
                            fieldId: 'orders_status',
                            tableName: 'orders',
                        },
                    },
                ),
                availability,
            ),
        ).toBe(false);
    });

    it('never locks SQL column rules or rules before fields load', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', {
                    fieldId: 'status',
                    tableName: 'sql',
                    isSqlColumn: true,
                }),
                availability,
            ),
        ).toBe(false);
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_hidden', tableName: 'orders' }),
                { ...availability, filterableFieldsByTileUuid: undefined },
            ),
        ).toBe(false);
    });

    it('does not lock a rule on a deleted field', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_deleted', tableName: 'orders' }),
                availability,
            ),
        ).toBe(false);
    });
});

describe('excludeLockedFilterRequirements', () => {
    const locked = rule('locked', {
        fieldId: 'orders_hidden',
        tableName: 'orders',
    });
    const open = rule('open', {
        fieldId: 'orders_status',
        tableName: 'orders',
    });
    const isLocked = (filterRule: DashboardFilterRule) =>
        isLockedDashboardFilterRule(filterRule, availability);

    it('drops single and all-locked group requirements', () => {
        expect(
            excludeLockedFilterRequirements(
                [
                    { type: 'single', filter: locked },
                    { type: 'group', groupId: 'g1', filters: [locked] },
                ],
                isLocked,
            ),
        ).toEqual([]);
    });

    it('keeps requirements a viewer can still meet', () => {
        const requirements = [
            { type: 'single' as const, filter: open },
            {
                type: 'group' as const,
                groupId: 'g1',
                filters: [locked, open],
            },
        ];
        expect(excludeLockedFilterRequirements(requirements, isLocked)).toEqual(
            requirements,
        );
    });
});
