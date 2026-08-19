/** Postgres type OIDs and wire format codes used by the Metrics SQL API */
export const PG_OID = {
    bool: 16,
    name: 19,
    int8: 20,
    int2: 21,
    int4: 23,
    text: 25,
    float4: 700,
    float8: 701,
    bpchar: 1042,
    varchar: 1043,
    date: 1082,
    timestamp: 1114,
    numeric: 1700,
} as const;

export const TEXT_FORMAT = 0;
export const BINARY_FORMAT = 1;

/** Text spellings Postgres accepts for boolean input */
export const TRUE_LITERALS = new Set(['t', 'true', 'y', 'yes', 'on', '1']);
export const FALSE_LITERALS = new Set(['f', 'false', 'n', 'no', 'off', '0']);
