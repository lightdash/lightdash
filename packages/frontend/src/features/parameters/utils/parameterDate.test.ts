import { describe, expect, it } from 'vitest';
import {
    parseParameterDateValue,
    serializeParameterDateValue,
} from './parameterDate';

describe('parameter date persistence', () => {
    it('serializes calendar dates as strict YYYY-MM-DD strings', () => {
        expect(serializeParameterDateValue(new Date(2024, 1, 29))).toBe(
            '2024-02-29',
        );
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
        expect(parseParameterDateValue('2023-02-29')).toBeNull();
        expect(parseParameterDateValue('not-a-date')).toBeNull();
        expect(parseParameterDateValue(null)).toBeNull();
    });

    it('round-trips through parse and serialize', () => {
        expect(
            serializeParameterDateValue(parseParameterDateValue('2024-02-29')),
        ).toBe('2024-02-29');
    });
});
