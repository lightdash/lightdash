import { DimensionType, FieldType, type Field } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { normalizeCellRawForFilter } from './normalizeCellRawForFilter';

const buildTimeIntervalDim = (
    baseType: DimensionType.TIMESTAMP | DimensionType.DATE,
): Field =>
    ({
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
    }) as unknown as Field;

const stringDim: Field = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    sql: '',
    hidden: false,
} as unknown as Field;

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
                buildTimeIntervalDim(DimensionType.TIMESTAMP),
                'Europe/Paris',
            ),
        ).toBe('2024-11-01');
    });

    test('TIMESTAMP-base: negative offset preserves the displayed bucket', () => {
        expect(
            normalizeCellRawForFilter(
                nyNovInstant,
                buildTimeIntervalDim(DimensionType.TIMESTAMP),
                'America/New_York',
            ),
        ).toBe('2024-11-01');
    });

    test('DATE-base: negative offset must NOT shift the calendar date back', () => {
        expect(
            normalizeCellRawForFilter(
                dateBaseNov,
                buildTimeIntervalDim(DimensionType.DATE),
                'America/New_York',
            ),
        ).toBe(dateBaseNov);
    });

    test('DATE-base: positive offset is left unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                dateBaseNov,
                buildTimeIntervalDim(DimensionType.DATE),
                'Asia/Tokyo',
            ),
        ).toBe(dateBaseNov);
    });

    test('non-time-interval dim is left unchanged', () => {
        expect(
            normalizeCellRawForFilter('pending', stringDim, 'Europe/Paris'),
        ).toBe('pending');
    });

    test('null / undefined raw is returned as-is', () => {
        const field = buildTimeIntervalDim(DimensionType.TIMESTAMP);
        expect(
            normalizeCellRawForFilter(null, field, 'Europe/Paris'),
        ).toBeNull();
        expect(
            normalizeCellRawForFilter(undefined, field, 'Europe/Paris'),
        ).toBeUndefined();
    });

    test('missing field returns the raw value unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                parisNovInstant,
                undefined,
                'Europe/Paris',
            ),
        ).toBe(parisNovInstant);
    });

    test('TIMESTAMP-base with no timezone returns raw value unchanged', () => {
        expect(
            normalizeCellRawForFilter(
                parisNovInstant,
                buildTimeIntervalDim(DimensionType.TIMESTAMP),
                undefined,
            ),
        ).toBe(parisNovInstant);
    });
});
