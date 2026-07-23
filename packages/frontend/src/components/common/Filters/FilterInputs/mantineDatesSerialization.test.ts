import { describe, expect, it } from 'vitest';
import {
    parseParameterDateValue,
    serializeMantineDateRangeToIso,
    serializeParameterDateValue,
} from './mantineDateSerialization';

describe('Mantine Dates domain serialization', () => {
    it('serializes Funnel local calendar dates to its existing ISO boundary', () => {
        expect(
            serializeMantineDateRangeToIso(['2025-05-14', '2025-05-16']),
        ).toEqual([
            new Date(2025, 4, 14).toISOString(),
            new Date(2025, 4, 16).toISOString(),
        ]);
        expect(serializeMantineDateRangeToIso(['2025-05-14', null])).toEqual([
            new Date(2025, 4, 14).toISOString(),
            null,
        ]);
    });

    it('serializes Omnibar local calendar dates to its existing ISO boundary', () => {
        expect(
            serializeMantineDateRangeToIso(['2025-05-14', '2025-05-16']),
        ).toEqual([
            new Date(2025, 4, 14).toISOString(),
            new Date(2025, 4, 16).toISOString(),
        ]);
        expect(serializeMantineDateRangeToIso([null, null])).toEqual([
            null,
            null,
        ]);
    });

    it('keeps parameter values as strict YYYY-MM-DD strings', () => {
        expect(serializeParameterDateValue('2024-02-29')).toBe('2024-02-29');
        expect(serializeParameterDateValue('2023-02-29')).toBeNull();
        expect(serializeParameterDateValue(null)).toBeNull();
    });

    it.each([
        ['2025-08-06', new Date(2025, 7, 6)],
        ['2025-08-06T00:00:00.000Z', new Date(2025, 7, 6)],
        ['2025-08-06 13:14:15', new Date(2025, 7, 6)],
    ])(
        'reads legacy parameter date value %s as a calendar date',
        (value, expected) => {
            expect(parseParameterDateValue(value)).toEqual(expected);
        },
    );

    it('rejects invalid legacy parameter date values', () => {
        expect(parseParameterDateValue('2025-02-29T00:00:00Z')).toBeNull();
        expect(parseParameterDateValue('not-a-date')).toBeNull();
        expect(parseParameterDateValue(null)).toBeNull();
    });
});
