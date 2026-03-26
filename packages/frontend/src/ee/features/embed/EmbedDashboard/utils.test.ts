import {
    DimensionType,
    FieldType,
    FilterOperator,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { convertSdkFilterToDashboardFilter } from './utils';

const makeDimension = (
    table: string,
    name: string,
    type: FilterableDimension['type'] = DimensionType.STRING,
): FilterableDimension =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        table,
        name,
        label: name,
        tableLabel: table,
        sql: `${table}.${name}`,
        hidden: false,
    }) as FilterableDimension;

const baseFilter = {
    model: 'payments',
    field: 'payment_method',
    operator: `${FilterOperator.EQUALS}` as const,
    value: 'bank_transfer',
};

describe('convertSdkFilterToDashboardFilter', () => {
    it('returns empty tileTargets when filterableFieldsByTileUuid is not provided', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter);

        expect(result.tileTargets).toEqual({});
        expect(result.target).toEqual({
            fieldId: 'payments_payment_method',
            tableName: 'payments',
        });
    });

    it('returns empty tileTargets when source field is not found', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter, {
            tile1: [makeDimension('orders', 'order_id')],
        });

        expect(result.tileTargets).toEqual({});
    });

    it('maps filter across multiple tiles with matching fields', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter, {
            tile1: [makeDimension('payments', 'payment_method')],
            tile2: [makeDimension('orders', 'payment_method')],
            tile3: [makeDimension('refunds', 'payment_method')],
        });

        expect(result.tileTargets).toEqual({
            tile1: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
            tile2: {
                fieldId: 'orders_payment_method',
                tableName: 'orders',
            },
            tile3: {
                fieldId: 'refunds_payment_method',
                tableName: 'refunds',
            },
        });
    });

    it('excludes tiles with no matching field', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter, {
            tile1: [makeDimension('payments', 'payment_method')],
            tile2: [makeDimension('orders', 'order_id')],
        });

        expect(result.tileTargets).toEqual({
            tile1: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
        });
        expect(result.tileTargets).not.toHaveProperty('tile2');
    });

    it('excludes tiles with undefined available filters', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter, {
            tile1: [makeDimension('payments', 'payment_method')],
            tile2: undefined,
        });

        expect(result.tileTargets).toEqual({
            tile1: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
        });
        expect(result.tileTargets).not.toHaveProperty('tile2');
    });

    it('does not match fields with same name but different type', () => {
        const result = convertSdkFilterToDashboardFilter(baseFilter, {
            tile1: [
                makeDimension(
                    'payments',
                    'payment_method',
                    DimensionType.STRING,
                ),
            ],
            tile2: [
                makeDimension('orders', 'payment_method', DimensionType.NUMBER),
            ],
        });

        expect(result.tileTargets).toEqual({
            tile1: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
        });
    });
});
