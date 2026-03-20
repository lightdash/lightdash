import { DimensionType } from '@lightdash/common';
import {
    ClickhouseTypes,
    convertDataTypeToDimensionType,
} from './ClickhouseWarehouseClient';

describe('convertDataTypeToDimensionType', () => {
    // Plain types (no wrappers)
    it.each([
        [ClickhouseTypes.BOOL, DimensionType.BOOLEAN],
        [ClickhouseTypes.UINT8, DimensionType.NUMBER],
        [ClickhouseTypes.UINT16, DimensionType.NUMBER],
        [ClickhouseTypes.UINT32, DimensionType.NUMBER],
        [ClickhouseTypes.UINT64, DimensionType.NUMBER],
        [ClickhouseTypes.INT8, DimensionType.NUMBER],
        [ClickhouseTypes.INT16, DimensionType.NUMBER],
        [ClickhouseTypes.INT32, DimensionType.NUMBER],
        [ClickhouseTypes.INT64, DimensionType.NUMBER],
        [ClickhouseTypes.FLOAT32, DimensionType.NUMBER],
        [ClickhouseTypes.FLOAT64, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL32, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL64, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL128, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL256, DimensionType.NUMBER],
        [ClickhouseTypes.DATE, DimensionType.DATE],
        [ClickhouseTypes.DATE32, DimensionType.DATE],
        [ClickhouseTypes.DATETIME, DimensionType.TIMESTAMP],
        [ClickhouseTypes.DATETIME64, DimensionType.TIMESTAMP],
        [ClickhouseTypes.STRING, DimensionType.STRING],
        [ClickhouseTypes.FIXEDSTRING, DimensionType.STRING],
        [ClickhouseTypes.UUID, DimensionType.STRING],
        [ClickhouseTypes.IPV4, DimensionType.STRING],
        [ClickhouseTypes.IPV6, DimensionType.STRING],
    ])('maps plain type %s to %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Nullable wrapper
    it.each([
        ['Nullable(Int32)', DimensionType.NUMBER],
        ['Nullable(Float64)', DimensionType.NUMBER],
        ['Nullable(Date)', DimensionType.DATE],
        ['Nullable(DateTime)', DimensionType.TIMESTAMP],
        ['Nullable(String)', DimensionType.STRING],
        ['Nullable(Bool)', DimensionType.BOOLEAN],
    ])('unwraps Nullable: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // LowCardinality wrapper
    it.each([
        ['LowCardinality(String)', DimensionType.STRING],
        ['LowCardinality(Int32)', DimensionType.NUMBER],
        ['LowCardinality(Date)', DimensionType.DATE],
        ['LowCardinality(DateTime)', DimensionType.TIMESTAMP],
    ])('unwraps LowCardinality: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Nested wrappers (the main bug fix)
    it.each([
        ['LowCardinality(Nullable(Int32))', DimensionType.NUMBER],
        ['LowCardinality(Nullable(Float64))', DimensionType.NUMBER],
        ['LowCardinality(Nullable(Date))', DimensionType.DATE],
        ['LowCardinality(Nullable(DateTime))', DimensionType.TIMESTAMP],
        ['LowCardinality(Nullable(String))', DimensionType.STRING],
        ['Nullable(LowCardinality(Int32))', DimensionType.NUMBER],
    ])('unwraps nested wrappers: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Multi-argument precision types (the second bug fix)
    it.each([
        ['Decimal(18, 2)', DimensionType.NUMBER],
        ['Decimal(10, 4)', DimensionType.NUMBER],
        ['Decimal32(9)', DimensionType.NUMBER],
        ['Decimal64(18)', DimensionType.NUMBER],
        ['Decimal128(38)', DimensionType.NUMBER],
        ['Decimal256(76)', DimensionType.NUMBER],
        ["DateTime64(3, 'UTC')", DimensionType.TIMESTAMP],
        ["DateTime64(6, 'Europe/London')", DimensionType.TIMESTAMP],
        ['DateTime64(3)', DimensionType.TIMESTAMP],
        ['FixedString(16)', DimensionType.STRING],
    ])('strips precision/scale arguments: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Combined: nested wrappers + precision arguments
    it.each([
        ['Nullable(Decimal(18, 2))', DimensionType.NUMBER],
        ["Nullable(DateTime64(3, 'UTC'))", DimensionType.TIMESTAMP],
        ['LowCardinality(Nullable(FixedString(16)))', DimensionType.STRING],
    ])('handles wrappers + precision combined: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Unknown types fall through to STRING
    it('returns STRING for unknown types', () => {
        expect(convertDataTypeToDimensionType('SomeFutureType')).toBe(
            DimensionType.STRING,
        );
    });
});
