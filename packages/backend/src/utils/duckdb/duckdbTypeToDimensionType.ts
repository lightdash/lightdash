import { DimensionType } from '@lightdash/common';

const NUMBER_TYPES = new Set([
    'TINYINT',
    'SMALLINT',
    'INTEGER',
    'BIGINT',
    'HUGEINT',
    'UTINYINT',
    'USMALLINT',
    'UINTEGER',
    'UBIGINT',
    'UHUGEINT',
    'FLOAT',
    'REAL',
    'DOUBLE',
    'DECIMAL',
    'NUMERIC',
]);

const TIMESTAMP_TYPES = new Set([
    'TIMESTAMP',
    'TIMESTAMPTZ',
    'TIMESTAMP WITH TIME ZONE',
    'TIMESTAMP_S',
    'TIMESTAMP_MS',
    'TIMESTAMP_NS',
    'DATETIME',
]);

/**
 * Map a DuckDB type name (from sniff_csv/DESCRIBE) to a Lightdash dimension
 * type. Inverse of resultFieldTypeToDuckdbType. Unknown types fall back to
 * STRING — ingest casts columns to the mapped type, so the fallback is
 * authoritative rather than a silent mismatch.
 */
export const duckdbTypeToDimensionType = (
    duckdbType: string,
): DimensionType => {
    const normalized = duckdbType
        .trim()
        .toUpperCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (NUMBER_TYPES.has(normalized)) {
        return DimensionType.NUMBER;
    }
    if (TIMESTAMP_TYPES.has(normalized)) {
        return DimensionType.TIMESTAMP;
    }
    if (normalized === 'DATE') {
        return DimensionType.DATE;
    }
    if (normalized === 'BOOLEAN' || normalized === 'BOOL') {
        return DimensionType.BOOLEAN;
    }
    return DimensionType.STRING;
};
