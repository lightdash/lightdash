/// <reference types="vitest/globals" />
import {
    DimensionType,
    FieldType,
    TimeFrames,
    type Explore,
} from '@lightdash/common';
import { normalizeCellRawForFilter } from './normalizeCellRawForFilter';

const buildExplore = (
    baseType: DimensionType.TIMESTAMP | DimensionType.DATE,
): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [],
        warehouse: '',
        ymlPath: '',
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: '',
                schema: '',
                sqlTable: 'orders',
                dimensions: {
                    created_at_month: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        name: 'created_at_month',
                        table: 'orders',
                        tableLabel: 'Orders',
                        label: 'Created at month',
                        sql: '',
                        hidden: false,
                        timeInterval: TimeFrames.MONTH,
                        timeIntervalBaseDimensionName: 'created_at',
                        timeIntervalBaseDimensionType: baseType,
                    },
                    status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        label: 'Status',
                        sql: '',
                        hidden: false,
                    },
                },
                metrics: {},
            },
        },
    }) as unknown as Explore;

// Paris Nov 2024 — UTC instant emitted by the DATE_TRUNC round-trip on a
// TIMESTAMP-base interval.
const parisNovInstant = '2024-10-31T23:00:00Z';
// NY Nov 2024.
const nyNovInstant = '2024-11-01T05:00:00Z';
// DATE-base interval value (calendar date encoded at UTC midnight).
const dateBaseNov = '2024-11-01T00:00:00Z';

describe('normalizeCellRawForFilter', () => {
    test('TIMESTAMP-base: positive offset shifts UTC instant into project TZ', () => {
        expect(
            normalizeCellRawForFilter(
                parisNovInstant,
                'orders_created_at_month',
                buildExplore(DimensionType.TIMESTAMP),
                'Europe/Paris',
            ),
        ).toBe('2024-11-01');
    });

    test('TIMESTAMP-base: negative offset preserves the displayed bucket', () => {
        expect(
            normalizeCellRawForFilter(
                nyNovInstant,
                'orders_created_at_month',
                buildExplore(DimensionType.TIMESTAMP),
                'America/New_York',
            ),
        ).toBe('2024-11-01');
    });

    test('DATE-base: negative offset must NOT shift the calendar date back', () => {
        expect(
            normalizeCellRawForFilter(
                dateBaseNov,
                'orders_created_at_month',
                buildExplore(DimensionType.DATE),
                'America/New_York',
            ),
        ).toBe(dateBaseNov);
    });

    test('DATE-base: positive offset is left unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                dateBaseNov,
                'orders_created_at_month',
                buildExplore(DimensionType.DATE),
                'Asia/Tokyo',
            ),
        ).toBe(dateBaseNov);
    });

    test('non-time-interval dim is left unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                'pending',
                'orders_status',
                buildExplore(DimensionType.TIMESTAMP),
                'Europe/Paris',
            ),
        ).toBe('pending');
    });

    test('null / undefined raw is returned as-is', () => {
        const explore = buildExplore(DimensionType.TIMESTAMP);
        expect(
            normalizeCellRawForFilter(
                null,
                'orders_created_at_month',
                explore,
                'Europe/Paris',
            ),
        ).toBeNull();
        expect(
            normalizeCellRawForFilter(
                undefined,
                'orders_created_at_month',
                explore,
                'Europe/Paris',
            ),
        ).toBeUndefined();
    });

    test('missing explore returns the raw value unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                parisNovInstant,
                'orders_created_at_month',
                undefined,
                'Europe/Paris',
            ),
        ).toBe(parisNovInstant);
    });
});
