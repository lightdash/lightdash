import { describe, expect, it } from 'vitest';
import {
    formatMantineDate,
    formatMantineDateRange,
    formatMantineDateTime,
    parseMantineDate,
    parseMantineDateRange,
    parseMantineDateTime,
} from './mantineDateAdapter';

describe('mantineDateAdapter', () => {
    it('formats a Date as a local calendar date', () => {
        expect(formatMantineDate(new Date(2024, 5, 15, 12, 30))).toBe(
            '2024-06-15',
        );
    });

    it('parses a Mantine date as a local calendar date', () => {
        expect(parseMantineDate('2024-06-15')).toEqual(new Date(2024, 5, 15));
    });

    it.each([
        [new Date(1000, 0, 1), '1000-01-01'],
        [new Date(2024, 1, 29), '2024-02-29'],
        [new Date(9999, 11, 31), '9999-12-31'],
    ])('supports the calendar boundary %s', (value, expected) => {
        expect(formatMantineDate(value)).toBe(expected);
        expect(parseMantineDate(expected)).toEqual(value);
    });

    it('returns null for absent and invalid Dates', () => {
        expect(formatMantineDate(null)).toBeNull();
        expect(formatMantineDate(new Date(Number.NaN))).toBeNull();
        expect(formatMantineDateTime(null)).toBeNull();
        expect(formatMantineDateTime(new Date(Number.NaN))).toBeNull();
        expect(parseMantineDate(null)).toBeNull();
        expect(parseMantineDateTime(null)).toBeNull();
    });

    it.each([
        '2023-02-29',
        '2024-02-30',
        '2024-00-01',
        '2024-13-01',
        '2024-01-00',
        '2024-01-32',
        '2024-1-01',
        '2024-01-1',
        'not-a-date',
        '',
    ])('rejects invalid or malformed date %j', (value) => {
        expect(parseMantineDate(value)).toBeNull();
    });

    it('formats a DateTime with second precision', () => {
        expect(
            formatMantineDateTime(new Date(2024, 5, 15, 23, 59, 58, 987)),
        ).toBe('2024-06-15 23:59:58');
    });

    it('parses a Mantine DateTime as local wall-clock time', () => {
        expect(parseMantineDateTime('2024-06-15 23:59:58')).toEqual(
            new Date(2024, 5, 15, 23, 59, 58),
        );
    });

    it.each([
        [new Date(2024, 5, 15, 0, 0, 0), '2024-06-15 00:00:00'],
        [new Date(2024, 5, 15, 12, 0, 0), '2024-06-15 12:00:00'],
        [new Date(2024, 5, 15, 23, 59, 59), '2024-06-15 23:59:59'],
    ])('round-trips the local wall-clock boundary %s', (value, expected) => {
        expect(formatMantineDateTime(value)).toBe(expected);
        expect(parseMantineDateTime(expected)).toEqual(value);
    });

    it.each([
        '2023-02-29 12:00:00',
        '2024-06-15 24:00:00',
        '2024-06-15 23:60:00',
        '2024-06-15 23:59:60',
        '2024-06-15T23:59:58',
        '2024-06-15 1:02:03',
        '2024-06-15',
        '',
    ])('rejects invalid or malformed DateTime %j', (value) => {
        expect(parseMantineDateTime(value)).toBeNull();
    });

    it('preserves complete and partial date ranges', () => {
        const complete: [Date | null, Date | null] = [
            new Date(2024, 0, 31),
            new Date(2024, 1, 29),
        ];
        const partial: [Date | null, Date | null] = [
            null,
            new Date(2024, 11, 31),
        ];

        expect(formatMantineDateRange(complete)).toEqual([
            '2024-01-31',
            '2024-02-29',
        ]);
        expect(parseMantineDateRange(formatMantineDateRange(complete))).toEqual(
            complete,
        );
        expect(formatMantineDateRange(partial)).toEqual([null, '2024-12-31']);
        expect(parseMantineDateRange(formatMantineDateRange(partial))).toEqual(
            partial,
        );
    });
});
