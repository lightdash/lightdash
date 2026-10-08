import {
    DimensionType,
    FieldType,
    TimeFrames,
    type DashboardFilterableField,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFieldDisplayLabel } from './fieldGrains';

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
