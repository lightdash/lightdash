/** Postgres type OIDs and wire format codes used by the Metrics SQL API */
export const PG_OID = {
    bool: 16,
    char: 18,
    name: 19,
    int8: 20,
    int2: 21,
    int4: 23,
    regproc: 24,
    text: 25,
    oid: 26,
    float4: 700,
    float8: 701,
    nameArray: 1003,
    bpchar: 1042,
    varchar: 1043,
    date: 1082,
    timestamp: 1114,
    numeric: 1700,
    regclass: 2205,
    regtype: 2206,
} as const;

/** DimensionType / MetricType value -> Postgres type OID */
const FIELD_TYPE_OIDS: Record<string, number> = {
    string: PG_OID.text,
    number: PG_OID.float8,
    boolean: PG_OID.bool,
    date: PG_OID.date,
    timestamp: PG_OID.timestamp,
    count: PG_OID.int8,
    count_distinct: PG_OID.int8,
    sum: PG_OID.float8,
    average: PG_OID.float8,
    median: PG_OID.float8,
    percentile: PG_OID.float8,
    min: PG_OID.float8,
    max: PG_OID.float8,
};

/** DimensionType / MetricType value -> information_schema data_type name */
const DATA_TYPE_NAMES: Record<string, string> = {
    string: 'text',
    number: 'double precision',
    boolean: 'boolean',
    date: 'date',
    timestamp: 'timestamp without time zone',
    count: 'bigint',
    count_distinct: 'bigint',
    sum: 'double precision',
    average: 'double precision',
    median: 'double precision',
    percentile: 'double precision',
    min: 'double precision',
    max: 'double precision',
};

export const fieldTypeOid = (type: string | null): number =>
    (type && FIELD_TYPE_OIDS[type]) || PG_OID.text;

export const dataTypeName = (type: string): string =>
    DATA_TYPE_NAMES[type] ?? 'text';

export const TEXT_FORMAT = 0;
export const BINARY_FORMAT = 1;

/** Text spellings Postgres accepts for boolean input */
export const TRUE_LITERALS = new Set(['t', 'true', 'y', 'yes', 'on', '1']);
export const FALSE_LITERALS = new Set(['f', 'false', 'n', 'no', 'off', '0']);
