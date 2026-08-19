import { describe, expect, it } from 'vitest';
import { decodeBinaryParameter, encodeBinaryValue } from './binaryFormat';
import { float64, int32, int64 } from './wireEncoding';

describe('decodeBinaryParameter', () => {
    it('decodes the fixed-width numeric and boolean types to text', () => {
        expect(decodeBinaryParameter(Buffer.from([1]), 16)).toBe('t');
        expect(decodeBinaryParameter(Buffer.from([0]), 16)).toBe('f');
        expect(decodeBinaryParameter(Buffer.from([0xff, 0xfe]), 21)).toBe('-2');
        expect(decodeBinaryParameter(int32(800), 23)).toBe('800');
        expect(decodeBinaryParameter(int64(9007199254740993n), 20)).toBe(
            '9007199254740993',
        );
        const float4 = Buffer.alloc(4);
        float4.writeFloatBE(1.5);
        expect(decodeBinaryParameter(float4, 700)).toBe('1.5');
        expect(decodeBinaryParameter(float64(800.5), 701)).toBe('800.5');
    });

    it('decodes binary date and timestamp parameters to the text the compiler expects', () => {
        expect(decodeBinaryParameter(int32(0), 1082)).toBe('2000-01-01');
        expect(decodeBinaryParameter(int32(9556), 1082)).toBe('2026-03-01');
        expect(decodeBinaryParameter(int32(-1), 1082)).toBe('1999-12-31');
        expect(decodeBinaryParameter(int64(0n), 1114)).toBe(
            '2000-01-01 00:00:00.000000',
        );
        expect(decodeBinaryParameter(int64(1_500_000n), 1114)).toBe(
            '2000-01-01 00:00:01.500000',
        );
        expect(decodeBinaryParameter(int64(-1n), 1114)).toBe(
            '1999-12-31 23:59:59.999999',
        );
        expect(decodeBinaryParameter(int64(-500_000n), 1114)).toBe(
            '1999-12-31 23:59:59.500000',
        );
    });

    it('rejects out-of-range binary dates and timestamps with 22008', () => {
        expect(() => decodeBinaryParameter(int32(2 ** 31 - 1), 1082)).toThrow(
            expect.objectContaining({ code: '22008' }),
        );
        expect(() =>
            decodeBinaryParameter(int64(9223372036854775807n), 1114),
        ).toThrow(expect.objectContaining({ code: '22008' }));
    });

    it('passes text-like types through as UTF-8', () => {
        expect(decodeBinaryParameter(Buffer.from('héllo'), 1043)).toBe('héllo');
    });

    it('rejects wrong lengths with 22P03 and unknown types with 0A000', () => {
        expect(() => decodeBinaryParameter(Buffer.from([0]), 23)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
        expect(() => decodeBinaryParameter(int32(1), 1700)).toThrow(
            expect.objectContaining({ code: '0A000' }),
        );
    });
});

describe('encodeBinaryValue', () => {
    it('encodes bool, int4, int8, float8 from their text form', () => {
        expect(encodeBinaryValue('t', 16)).toEqual(Buffer.from([1]));
        expect(encodeBinaryValue('TRUE', 16)).toEqual(Buffer.from([1]));
        expect(encodeBinaryValue('yes', 16)).toEqual(Buffer.from([1]));
        expect(encodeBinaryValue('f', 16)).toEqual(Buffer.from([0]));
        expect(encodeBinaryValue('false', 16)).toEqual(Buffer.from([0]));
        expect(encodeBinaryValue('7', 23)).toEqual(int32(7));
        expect(encodeBinaryValue('2397', 20)).toEqual(int64(2397n));
        expect(encodeBinaryValue('12.0', 20)).toEqual(int64(12n));
        expect(encodeBinaryValue('889.57', 701)).toEqual(float64(889.57));
    });

    it('reports out-of-range integers with 22003 and empty text with 22P03', () => {
        expect(() => encodeBinaryValue('3000000000', 23)).toThrow(
            expect.objectContaining({ code: '22003' }),
        );
        expect(() => encodeBinaryValue('9223372036854775808', 20)).toThrow(
            expect.objectContaining({ code: '22003' }),
        );
        expect(encodeBinaryValue('9223372036854775807', 20)).toEqual(
            int64(9223372036854775807n),
        );
        expect(() => encodeBinaryValue('', 20)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
        expect(() => encodeBinaryValue(' ', 701)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
    });

    it('encodes date as days and timestamp as microseconds since 2000-01-01', () => {
        expect(encodeBinaryValue('2000-01-01', 1082)).toEqual(int32(0));
        const year50 = new Date(0);
        year50.setUTCFullYear(50, 0, 1); // Date.UTC(50, …) would mean 1950
        expect(encodeBinaryValue('0050-01-01', 1082)).toEqual(
            int32((year50.getTime() - Date.UTC(2000, 0, 1)) / 86400000),
        );
        expect(encodeBinaryValue('2026-03-01', 1082)).toEqual(int32(9556));
        expect(encodeBinaryValue('1999-12-31', 1082)).toEqual(int32(-1));
        expect(encodeBinaryValue('2000-01-01 00:00:00+00', 1114)).toEqual(
            int64(0n),
        );
        expect(encodeBinaryValue('2000-01-01 00:00:01.5+00', 1114)).toEqual(
            int64(1_500_000n),
        );
        expect(
            encodeBinaryValue('2000-01-01 00:00:00.123456789', 1114),
        ).toEqual(int64(123_456n));
        expect(encodeBinaryValue('2026-03-01 12:34:56Z', 1114)).toEqual(
            int64(
                BigInt(
                    Date.UTC(2026, 2, 1, 12, 34, 56) - Date.UTC(2000, 0, 1),
                ) * 1000n,
            ),
        );
    });

    it('encodes the catalog column types: oid, int2, char, float4', () => {
        const oid = Buffer.alloc(4);
        oid.writeUInt32BE(3000000000);
        expect(encodeBinaryValue('3000000000', 26)).toEqual(oid);
        expect(encodeBinaryValue('1259', 2205)).toEqual(int32(1259));
        expect(encodeBinaryValue('-2', 21)).toEqual(Buffer.from([0xff, 0xfe]));
        expect(encodeBinaryValue('r', 18)).toEqual(Buffer.from('r'));
        const float4 = Buffer.alloc(4);
        float4.writeFloatBE(1.5);
        expect(encodeBinaryValue('1.5', 700)).toEqual(float4);
        expect(() => encodeBinaryValue('70000', 21)).toThrow(
            expect.objectContaining({ code: '22003' }),
        );
    });

    it('passes text through and rejects types it cannot encode', () => {
        expect(encodeBinaryValue('abc', 25)).toEqual(Buffer.from('abc'));
        expect(() => encodeBinaryValue('1.5', 1700)).toThrow(
            expect.objectContaining({ code: '0A000' }),
        );
        expect(() => encodeBinaryValue('not a date', 1082)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
        expect(() => encodeBinaryValue('2024-13-45 10:00:00', 1114)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
        expect(() => encodeBinaryValue('abc', 20)).toThrow(
            expect.objectContaining({ code: '22P03' }),
        );
    });
});
