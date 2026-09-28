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

const fieldsByTile = { 'tile-1': [statusField] };

describe('isLockedDashboardFilterRule', () => {
    it('locks a rule whose field no tile offers', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_hidden', tableName: 'orders' }),
                fieldsByTile,
            ),
        ).toBe(true);
    });

    it('does not lock a rule whose field or tile mapping a tile offers', () => {
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_status', tableName: 'orders' }),
                fieldsByTile,
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
                fieldsByTile,
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
                fieldsByTile,
            ),
        ).toBe(false);
        expect(
            isLockedDashboardFilterRule(
                rule('a', { fieldId: 'orders_hidden', tableName: 'orders' }),
                undefined,
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
        isLockedDashboardFilterRule(filterRule, fieldsByTile);

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
