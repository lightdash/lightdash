import dayjs from 'dayjs';
import type { CatalogField } from '../types/catalog';
import {
    DimensionType,
    FieldType,
    type CompiledDimension,
} from '../types/field';
import { FilterOperator } from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import {
    getDateCalcUtils,
    getInitialDefaultFilterRule,
    getInitialDefaultSegment,
} from './metricsExplorer';

const dimRegion: CompiledDimension = {
    name: 'region',
    table: 'orders',
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    label: 'Region',
    sql: '${TABLE}.region',
    compiledSql: '"orders".region',
    tablesReferences: ['orders'],
    tableLabel: 'Orders',
    hidden: false,
};

const formatDate = (date: Date) => dayjs(date).format('YYYY-MM-DD');

describe('getDateCalcUtils', () => {
    test('day shift', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.DAY,
            TimeFrames.DAY,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-03-30');
        expect(formatDate(forward(base))).toBe('2026-04-01');
    });

    test('week shift', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.WEEK,
            TimeFrames.WEEK,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-03-24');
        expect(formatDate(forward(base))).toBe('2026-04-07');
    });

    test('month shift clamps end of month', () => {
        const { back, forward } = getDateCalcUtils(
            TimeFrames.MONTH,
            TimeFrames.MONTH,
        );
        const base = new Date('2026-03-31T00:00:00Z');
        expect(formatDate(back(base))).toBe('2026-02-28');
        expect(formatDate(forward(new Date('2026-01-31T00:00:00Z')))).toBe(
            '2026-02-28',
        );
    });

    test('year shift clamps leap day', () => {
        const { back } = getDateCalcUtils(TimeFrames.YEAR, TimeFrames.YEAR);
        const leap = new Date('2024-02-29T00:00:00Z');
        expect(formatDate(back(leap))).toBe('2023-02-28');
    });
});

describe('getInitialDefaultSegment', () => {
    test('resolves the default segment to the available dimension fieldId', () => {
        expect(
            getInitialDefaultSegment(
                {
                    spotlightDefaultSegment: 'region',
                    tableName: 'orders',
                } as CatalogField,
                [dimRegion],
            ),
        ).toBe('orders_region');
    });

    test('resolves a joined (table-qualified) default segment fieldId', () => {
        expect(
            getInitialDefaultSegment(
                {
                    spotlightDefaultSegment: 'orders.region',
                    tableName: 'metrics',
                } as CatalogField,
                [dimRegion],
            ),
        ).toBe('orders_region');
    });

    test('returns null when the default segment is not available', () => {
        expect(
            getInitialDefaultSegment(
                {
                    spotlightDefaultSegment: 'missing',
                    tableName: 'orders',
                } as CatalogField,
                [dimRegion],
            ),
        ).toBeNull();
    });

    test('returns null when no default is set', () => {
        expect(
            getInitialDefaultSegment({ tableName: 'orders' } as CatalogField, [
                dimRegion,
            ]),
        ).toBeNull();
    });
});

describe('getInitialDefaultFilterRule', () => {
    test('builds a FilterRule targeting the available dimension fieldId', () => {
        const rule = getInitialDefaultFilterRule(
            {
                tableName: 'orders',
                spotlightDefaultFilter: {
                    id: 'x',
                    target: { fieldRef: 'region' },
                    operator: FilterOperator.EQUALS,
                    values: ['EMEA'],
                    required: false,
                },
            } as CatalogField,
            [dimRegion],
        );
        expect(rule?.operator).toBe(FilterOperator.EQUALS);
        expect(rule?.values).toEqual(['EMEA']);
        expect(rule?.target.fieldId).toBe('orders_region');
        expect(rule?.required).toBe(false);
    });

    test('resolves a joined (table-qualified) fieldRef to its fieldId', () => {
        const rule = getInitialDefaultFilterRule(
            {
                tableName: 'metrics',
                spotlightDefaultFilter: {
                    id: 'x',
                    target: { fieldRef: 'orders.region' },
                    operator: FilterOperator.NOT_EQUALS,
                    values: ['EMEA'],
                },
            } as CatalogField,
            [dimRegion],
        );
        expect(rule?.target.fieldId).toBe('orders_region');
        expect(rule?.operator).toBe(FilterOperator.NOT_EQUALS);
    });

    test('returns undefined when the filter dimension is unavailable', () => {
        expect(
            getInitialDefaultFilterRule(
                {
                    tableName: 'orders',
                    spotlightDefaultFilter: {
                        id: 'x',
                        target: { fieldRef: 'missing' },
                        operator: FilterOperator.EQUALS,
                        values: ['v'],
                    },
                } as CatalogField,
                [dimRegion],
            ),
        ).toBeUndefined();
    });

    test('returns undefined when no default filter is set', () => {
        expect(
            getInitialDefaultFilterRule(
                { tableName: 'orders' } as CatalogField,
                [dimRegion],
            ),
        ).toBeUndefined();
    });
});
