import {
    assertUnreachable,
    DimensionType,
    type ResultNumericKind,
    type WarehouseResults,
} from '@lightdash/common';

type DuckdbSandboxField = WarehouseResults['fields'][string];

type DuckdbSandboxFieldType = {
    type: DimensionType;
    numericKind: ResultNumericKind['kind'] | null;
};

const INTEGER: DuckdbSandboxFieldType = {
    type: DimensionType.NUMBER,
    numericKind: 'integer',
};
const FLOAT: DuckdbSandboxFieldType = {
    type: DimensionType.NUMBER,
    numericKind: 'float',
};
const TIMESTAMP: DuckdbSandboxFieldType = {
    type: DimensionType.TIMESTAMP,
    numericKind: null,
};

/**
 * Field type of a result column by Python `DuckDBPyType.id`, mirroring the
 * server client's `mapFieldTypeFromTypeId` and numeric kinds. Types not
 * listed are strings. The sandbox runner embeds this table.
 */
export const DUCKDB_SANDBOX_FIELD_TYPES: Record<
    string,
    DuckdbSandboxFieldType
> = {
    boolean: { type: DimensionType.BOOLEAN, numericKind: null },
    tinyint: INTEGER,
    smallint: INTEGER,
    integer: INTEGER,
    bigint: INTEGER,
    hugeint: INTEGER,
    utinyint: INTEGER,
    usmallint: INTEGER,
    uinteger: INTEGER,
    ubigint: INTEGER,
    uhugeint: INTEGER,
    float: FLOAT,
    double: FLOAT,
    decimal: { type: DimensionType.NUMBER, numericKind: 'decimal' },
    date: { type: DimensionType.DATE, numericKind: null },
    time: TIMESTAMP,
    'time with time zone': TIMESTAMP,
    timestamp: TIMESTAMP,
    timestamp_s: TIMESTAMP,
    timestamp_ms: TIMESTAMP,
    timestamp_ns: TIMESTAMP,
    'timestamp with time zone': TIMESTAMP,
};

const STRING: DuckdbSandboxFieldType = {
    type: DimensionType.STRING,
    numericKind: null,
};

const toField = (
    { type, numericKind }: DuckdbSandboxFieldType,
    decimalScale: number | null,
): DuckdbSandboxField => {
    switch (numericKind) {
        case null:
            return { type };
        case 'integer':
        case 'float':
            return { type, numericKind: { kind: numericKind } };
        case 'decimal':
            return {
                type,
                numericKind: { kind: 'decimal', scale: decimalScale ?? 0 },
            };
        default:
            return assertUnreachable(numericKind, 'Unknown numeric kind');
    }
};

/** The field the runner reports for a column of this Python type id. */
export const getDuckdbSandboxField = (
    pythonTypeId: string,
    decimalScale: number | null,
): DuckdbSandboxField =>
    toField(DUCKDB_SANDBOX_FIELD_TYPES[pythonTypeId] ?? STRING, decimalScale);
