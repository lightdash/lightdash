import { DimensionType } from '@lightdash/common';
import { duckdbTypeToDimensionType } from './duckdbTypeToDimensionType';

describe('duckdbTypeToDimensionType', () => {
    it('maps numeric types to NUMBER', () => {
        expect(duckdbTypeToDimensionType('BIGINT')).toBe(DimensionType.NUMBER);
        expect(duckdbTypeToDimensionType('DOUBLE')).toBe(DimensionType.NUMBER);
        expect(duckdbTypeToDimensionType('DECIMAL(18,3)')).toBe(
            DimensionType.NUMBER,
        );
        expect(duckdbTypeToDimensionType('HUGEINT')).toBe(DimensionType.NUMBER);
        expect(duckdbTypeToDimensionType('UTINYINT')).toBe(
            DimensionType.NUMBER,
        );
    });

    it('maps temporal types', () => {
        expect(duckdbTypeToDimensionType('DATE')).toBe(DimensionType.DATE);
        expect(duckdbTypeToDimensionType('TIMESTAMP')).toBe(
            DimensionType.TIMESTAMP,
        );
        expect(duckdbTypeToDimensionType('TIMESTAMP WITH TIME ZONE')).toBe(
            DimensionType.TIMESTAMP,
        );
        expect(duckdbTypeToDimensionType('timestamp_ns')).toBe(
            DimensionType.TIMESTAMP,
        );
    });

    it('maps booleans and strings', () => {
        expect(duckdbTypeToDimensionType('BOOLEAN')).toBe(
            DimensionType.BOOLEAN,
        );
        expect(duckdbTypeToDimensionType('VARCHAR')).toBe(DimensionType.STRING);
    });

    it('falls back to STRING for unknown types', () => {
        expect(duckdbTypeToDimensionType('INTERVAL')).toBe(
            DimensionType.STRING,
        );
        expect(duckdbTypeToDimensionType('STRUCT(a INTEGER)')).toBe(
            DimensionType.STRING,
        );
        expect(duckdbTypeToDimensionType('TIME')).toBe(DimensionType.STRING);
    });
});
