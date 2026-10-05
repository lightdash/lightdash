import {
    CustomDimensionType,
    DimensionType,
    FieldType,
    FilterType,
    MetricType,
    TableCalculationType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    CONTROL_TYPE_LABELS,
    CONTROL_TYPES,
    getColumnsOfControlType,
    getControlTypeForParameter,
    getControlTypeFromItem,
    getControlTypeFromItemType,
    getControlTypeWord,
    getDraftSettingsField,
    getFieldsOfControlType,
    getFilterTypeForControl,
    getParameterTypeForControl,
    isItemOfControlType,
} from './controlType';

const dimension = (name: string, type: DimensionType) =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name,
        label: name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    }) as DashboardFilterableField;

const metric = (name: string, type: MetricType) =>
    ({
        fieldType: FieldType.METRIC,
        type,
        name,
        label: name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    }) as DashboardFilterableField;

// A custom SQL dimension counts by its dimension type
const customSql = (name: string, dimensionType: DimensionType) =>
    ({
        id: name,
        name,
        table: 'orders',
        type: CustomDimensionType.SQL,
        sql: '',
        dimensionType,
    }) as unknown as DashboardFilterableField;

const tableCalculation = (name: string, type: TableCalculationType) =>
    ({
        name,
        displayName: name,
        sql: '${orders.day}',
        type,
    }) as unknown as DashboardFilterableField;

describe('control types', () => {
    it('offers five, in menu order, with a word each', () => {
        expect(CONTROL_TYPES.map((type) => CONTROL_TYPE_LABELS[type])).toEqual([
            'Date',
            'Time',
            'Text',
            'Number',
            'Boolean',
        ]);
        expect(CONTROL_TYPES.map(getControlTypeWord)).toEqual([
            'date',
            'time',
            'text',
            'number',
            'boolean',
        ]);
    });

    it('writes a date filter for both date and time', () => {
        expect(CONTROL_TYPES.map(getFilterTypeForControl)).toEqual([
            FilterType.DATE,
            FilterType.DATE,
            FilterType.STRING,
            FilterType.NUMBER,
            FilterType.BOOLEAN,
        ]);
    });
});

describe('getControlTypeFromItemType', () => {
    it.each([
        [DimensionType.DATE, 'date'],
        [MetricType.DATE, 'date'],
        [TableCalculationType.DATE, 'date'],
        [DimensionType.TIMESTAMP, 'time'],
        [MetricType.TIMESTAMP, 'time'],
        [TableCalculationType.TIMESTAMP, 'time'],
        [DimensionType.STRING, 'text'],
        [TableCalculationType.STRING, 'text'],
        [DimensionType.NUMBER, 'number'],
        [MetricType.SUM, 'number'],
        [MetricType.COUNT_DISTINCT, 'number'],
        [DimensionType.BOOLEAN, 'boolean'],
        [MetricType.BOOLEAN, 'boolean'],
    ] as const)('puts %s under %s', (itemType, controlType) => {
        expect(getControlTypeFromItemType(itemType)).toBe(controlType);
    });
});

describe('getControlTypeFromItem', () => {
    it('reads a dimension and a metric by their type', () => {
        expect(
            getControlTypeFromItem(dimension('day', DimensionType.DATE)),
        ).toBe('date');
        expect(
            getControlTypeFromItem(dimension('at', DimensionType.TIMESTAMP)),
        ).toBe('time');
        expect(getControlTypeFromItem(metric('last', MetricType.DATE))).toBe(
            'date',
        );
        expect(
            getControlTypeFromItem(metric('last_at', MetricType.TIMESTAMP)),
        ).toBe('time');
    });

    it('reads a custom SQL dimension by its dimension type', () => {
        expect(
            getControlTypeFromItem(customSql('day', DimensionType.DATE)),
        ).toBe('date');
        expect(
            getControlTypeFromItem(customSql('at', DimensionType.TIMESTAMP)),
        ).toBe('time');
    });

    it('reads a table calculation by its type', () => {
        expect(
            getControlTypeFromItem(
                tableCalculation('day', TableCalculationType.DATE),
            ),
        ).toBe('date');
        expect(
            getControlTypeFromItem(
                tableCalculation('at', TableCalculationType.TIMESTAMP),
            ),
        ).toBe('time');
    });
});

describe('what a tile offers a control', () => {
    const day = dimension('day', DimensionType.DATE);
    const at = dimension('at', DimensionType.TIMESTAMP);
    const status = dimension('status', DimensionType.STRING);
    const lastAt = metric('last_at', MetricType.TIMESTAMP);
    const customDay = customSql('custom_day', DimensionType.DATE);
    const fields = [day, at, status, lastAt, customDay];

    it('gives a date control the plain dates only', () => {
        expect(getFieldsOfControlType(fields, 'date')).toEqual([
            day,
            customDay,
        ]);
        expect(isItemOfControlType(at, 'date')).toBe(false);
    });

    it('gives a time control the timestamps only', () => {
        expect(getFieldsOfControlType(fields, 'time')).toEqual([at, lastAt]);
        expect(isItemOfControlType(day, 'time')).toBe(false);
    });

    it('gives the other types what they had', () => {
        expect(getFieldsOfControlType(fields, 'text')).toEqual([status]);
        expect(getFieldsOfControlType(fields, 'number')).toEqual([]);
    });

    it('splits SQL chart columns the same way', () => {
        const columns = [
            { reference: 'day', type: DimensionType.DATE },
            { reference: 'at', type: DimensionType.TIMESTAMP },
            { reference: 'status', type: DimensionType.STRING },
        ];
        expect(
            getColumnsOfControlType(columns, 'date').map((c) => c.reference),
        ).toEqual(['day']);
        expect(
            getColumnsOfControlType(columns, 'time').map((c) => c.reference),
        ).toEqual(['at']);
    });
});

describe('parameters', () => {
    it('gives date parameters to date controls and none to time', () => {
        expect(CONTROL_TYPES.map(getParameterTypeForControl)).toEqual([
            'date',
            null,
            'string',
            'number',
            null,
        ]);
        expect(getControlTypeForParameter('date')).toBe('date');
        expect(getControlTypeForParameter('string')).toBe('text');
        expect(getControlTypeForParameter('number')).toBe('number');
    });
});

describe('getDraftSettingsField', () => {
    it('stands in with a plain date for date and a timestamp for time', () => {
        expect(getDraftSettingsField('date')).toMatchObject({
            type: DimensionType.DATE,
        });
        expect(getDraftSettingsField('time')).toMatchObject({
            type: DimensionType.TIMESTAMP,
        });
    });

    it('needs none for the other types', () => {
        expect(getDraftSettingsField('text')).toBeUndefined();
        expect(getDraftSettingsField('number')).toBeUndefined();
        expect(getDraftSettingsField('boolean')).toBeUndefined();
    });

    it('belongs to its own control type', () => {
        const date = getDraftSettingsField('date');
        const time = getDraftSettingsField('time');
        expect(date && getControlTypeFromItem(date)).toBe('date');
        expect(time && getControlTypeFromItem(time)).toBe('time');
    });
});
