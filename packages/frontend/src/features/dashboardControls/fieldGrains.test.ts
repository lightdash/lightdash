import {
    DimensionType,
    FieldType,
    TimeFrames,
    type DashboardFilterableField,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { foldFieldGrains, getFieldDisplayLabel } from './fieldGrains';

const dimension = (
    name: string,
    label: string,
    extra: Partial<FilterableDimension> = {},
): DashboardFilterableField =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.TIMESTAMP,
        name,
        label,
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
        ...extra,
    }) as FilterableDimension;

const createdRaw = dimension('created', 'Created');
const createdDay = dimension('created_day', 'Created day', {
    timeInterval: TimeFrames.DAY,
    timeIntervalBaseDimensionName: 'created',
});
const createdMonth = dimension('created_month', 'Created month', {
    timeInterval: TimeFrames.MONTH,
    timeIntervalBaseDimensionName: 'created',
});
const status = dimension('status', 'Status', {
    type: DimensionType.STRING,
});

describe('foldFieldGrains', () => {
    it('folds grains of one base dimension into one row that picks DAY', () => {
        const rows = foldFieldGrains([
            createdRaw,
            createdMonth,
            createdDay,
            status,
        ]);
        expect(rows.map((row) => row.label)).toEqual(['Created', 'Status']);
        expect(rows[0].field).toBe(createdDay);
        expect(rows[0].members).toHaveLength(3);
        expect(rows[0].tableLabel).toBe('Orders');
    });

    it('picks the base dimension when there is no DAY grain', () => {
        const rows = foldFieldGrains([createdRaw, createdMonth]);
        expect(rows[0].field).toBe(createdRaw);
    });

    it('picks the first grain and strips the suffix when the base is absent', () => {
        const rows = foldFieldGrains([createdMonth]);
        expect(rows).toHaveLength(1);
        expect(rows[0].label).toBe('Created');
        expect(rows[0].field).toBe(createdMonth);
    });

    it('keeps fields of different tables apart', () => {
        const other = dimension('created_day', 'Created day', {
            table: 'customers',
            tableLabel: 'Customers',
            timeInterval: TimeFrames.DAY,
            timeIntervalBaseDimensionName: 'created',
        });
        const rows = foldFieldGrains([createdDay, other]);
        expect(rows).toHaveLength(2);
    });
});

describe('getFieldDisplayLabel', () => {
    it('names a time grain by its base dimension', () => {
        expect(getFieldDisplayLabel(createdDay, [createdRaw, createdDay])).toBe(
            'Created',
        );
        expect(getFieldDisplayLabel(createdMonth, [createdMonth])).toBe(
            'Created',
        );
    });

    it('keeps the label of a plain field', () => {
        expect(getFieldDisplayLabel(status, [status, createdDay])).toBe(
            'Status',
        );
    });
});
