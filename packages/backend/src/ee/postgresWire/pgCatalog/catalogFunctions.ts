import { PG_OID } from '../pgTypes';
import { PgWireServerError } from '../PgWireServerError';
import { type PgWireTable } from '../types';
import { assertValueLength, unitsForLength } from './catalogLimits';
import {
    regclassOid,
    type CatalogRelation,
    type CatalogValue,
} from './catalogRelations';

/**
 * Scalar functions drivers and GUI tools call while browsing the catalog.
 * Each returns a value and declares the type OID of its result.
 */

export const VERSION_STRING =
    'PostgreSQL 16.3 (Lightdash semantic layer, wire protocol)';

export type FunctionContext = {
    databaseName: string;
    userName: string;
    catalog: PgWireTable[];
    relations: Map<string, CatalogRelation>;
    /** charge work units to the statement's budget */
    charge: (units: number) => void;
};

/** A string result: bounded in size and charged to the budget */
const built = (context: FunctionContext, value: string): string => {
    context.charge(unitsForLength(value.length));
    return assertValueLength(value);
};

/** Functions that produce rows and may appear in FROM */
export const SET_RETURNING_FUNCTIONS = new Set([
    'generate_series',
    'unnest',
    'pg_get_keywords',
]);

export type CatalogFunction = {
    oid: number;
    call: (args: CatalogValue[], context: FunctionContext) => CatalogValue;
};

const typeNameByOid = (
    relations: Map<string, CatalogRelation>,
    oid: number,
): string | null => {
    const row = relations
        .get('pg_catalog.pg_type')
        ?.rows.find((r) => r.oid === oid);
    return row ? String(row.typname) : null;
};

/** format_type: the SQL-standard spelling Postgres prints for common types */
const FORMATTED_TYPE_NAMES: Record<string, string> = {
    bool: 'boolean',
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    float4: 'real',
    float8: 'double precision',
    varchar: 'character varying',
    bpchar: 'character',
    timestamp: 'timestamp without time zone',
    timestamptz: 'timestamp with time zone',
    time: 'time without time zone',
    timetz: 'time with time zone',
};

/** Comment stored in pg_description for an object (objsubid 0) or one of its columns */
const descriptionOf = (
    relations: Map<string, CatalogRelation>,
    objectOid: number | null,
    subId: number | null,
): CatalogValue => {
    if (objectOid === null || subId === null) {
        return null;
    }
    const row = relations
        .get('pg_catalog.pg_description')
        ?.rows.find((r) => r.objoid === objectOid && r.objsubid === subId);
    return row ? (row.description ?? null) : null;
};

const asString = (value: CatalogValue): string | null =>
    value === null ? null : String(value);

const asNumber = (value: CatalogValue): number | null =>
    value === null ? null : Number(value);

const timestampNow = (): string =>
    new Date().toISOString().replace('T', ' ').replace('Z', '+00');

const constant = (
    oid: number,
    value: (context: FunctionContext) => CatalogValue,
): CatalogFunction => ({ oid, call: (_, context) => value(context) });

const nullary = (oid: number, value: CatalogValue): CatalogFunction => ({
    oid,
    call: () => value,
});

export const CATALOG_FUNCTIONS: Record<string, CatalogFunction> = {
    version: nullary(PG_OID.text, VERSION_STRING),
    current_database: constant(PG_OID.name, (c) => c.databaseName),
    current_catalog: constant(PG_OID.name, (c) => c.databaseName),
    current_schema: nullary(PG_OID.name, 'public'),
    current_schemas: {
        oid: PG_OID.nameArray,
        call: ([includeImplicit]) =>
            includeImplicit === true ? ['pg_catalog', 'public'] : ['public'],
    },
    current_user: constant(PG_OID.name, (c) => c.userName),
    session_user: constant(PG_OID.name, (c) => c.userName),
    current_role: constant(PG_OID.name, (c) => c.userName),
    user: constant(PG_OID.name, (c) => c.userName),
    current_setting: {
        oid: PG_OID.text,
        call: ([name], context) => {
            const row = context.relations
                .get('pg_catalog.pg_settings')
                ?.rows.find((r) => r.name === asString(name));
            return row ? (row.setting ?? null) : null;
        },
    },
    now: constant(PG_OID.timestamp, () => timestampNow()),
    current_timestamp: constant(PG_OID.timestamp, () => timestampNow()),
    pg_postmaster_start_time: nullary(PG_OID.timestamp, timestampNow()),
    pg_backend_pid: nullary(PG_OID.int4, process.pid),
    txid_current: nullary(PG_OID.int8, 1),
    pg_is_in_recovery: nullary(PG_OID.bool, false),
    inet_server_addr: nullary(PG_OID.text, null),
    inet_server_port: nullary(PG_OID.int4, 5432),
    // nothing has defaults, views, partitions, indexes or constraints
    pg_get_expr: nullary(PG_OID.text, null),
    pg_get_viewdef: nullary(PG_OID.text, null),
    pg_get_partkeydef: nullary(PG_OID.text, null),
    pg_get_indexdef: nullary(PG_OID.text, null),
    pg_get_constraintdef: nullary(PG_OID.text, null),
    pg_get_triggerdef: nullary(PG_OID.text, null),
    pg_get_ruledef: nullary(PG_OID.text, null),
    pg_get_functiondef: nullary(PG_OID.text, null),
    pg_get_function_arguments: nullary(PG_OID.text, null),
    pg_get_function_result: nullary(PG_OID.text, null),
    pg_get_serial_sequence: nullary(PG_OID.text, null),
    pg_get_keywords: nullary(PG_OID.text, null),
    obj_description: {
        oid: PG_OID.text,
        call: ([objectOid], context) =>
            descriptionOf(context.relations, asNumber(objectOid), 0),
    },
    col_description: {
        oid: PG_OID.text,
        call: ([tableOid, column], context) =>
            descriptionOf(
                context.relations,
                asNumber(tableOid),
                asNumber(column),
            ),
    },
    shobj_description: nullary(PG_OID.text, null),
    pg_get_userbyid: constant(PG_OID.name, (c) => c.userName),
    pg_table_is_visible: nullary(PG_OID.bool, true),
    pg_type_is_visible: nullary(PG_OID.bool, true),
    pg_function_is_visible: nullary(PG_OID.bool, true),
    has_schema_privilege: nullary(PG_OID.bool, true),
    has_table_privilege: nullary(PG_OID.bool, true),
    has_any_column_privilege: nullary(PG_OID.bool, true),
    has_column_privilege: nullary(PG_OID.bool, true),
    has_database_privilege: nullary(PG_OID.bool, true),
    has_function_privilege: nullary(PG_OID.bool, true),
    pg_has_role: nullary(PG_OID.bool, true),
    pg_total_relation_size: nullary(PG_OID.int8, 0),
    pg_relation_size: nullary(PG_OID.int8, 0),
    pg_table_size: nullary(PG_OID.int8, 0),
    pg_indexes_size: nullary(PG_OID.int8, 0),
    pg_database_size: nullary(PG_OID.int8, 0),
    pg_size_pretty: nullary(PG_OID.text, '0 bytes'),
    pg_encoding_to_char: nullary(PG_OID.name, 'UTF8'),
    pg_relation_filepath: nullary(PG_OID.text, null),
    pg_tablespace_location: nullary(PG_OID.text, ''),
    format_type: {
        oid: PG_OID.text,
        call: ([oid], context) => {
            const typname =
                oid === null
                    ? null
                    : typeNameByOid(context.relations, Number(oid));
            if (typname === null) {
                return '???';
            }
            return FORMATTED_TYPE_NAMES[typname] ?? typname;
        },
    },
    nullif: {
        oid: PG_OID.text,
        call: ([a, b]) => (a === b ? null : a),
    },
    coalesce: {
        oid: PG_OID.text,
        call: (args) => args.find((v) => v !== null) ?? null,
    },
    replace: {
        oid: PG_OID.text,
        call: ([text, from, to], context) =>
            text === null
                ? null
                : built(
                      context,
                      String(text).split(String(from)).join(String(to)),
                  ),
    },
    upper: {
        oid: PG_OID.text,
        call: ([v], context) => {
            const text = asString(v);
            return text === null ? null : built(context, text.toUpperCase());
        },
    },
    lower: {
        oid: PG_OID.text,
        call: ([v], context) => {
            const text = asString(v);
            return text === null ? null : built(context, text.toLowerCase());
        },
    },
    trim: { oid: PG_OID.text, call: ([v]) => asString(v)?.trim() ?? null },
    btrim: { oid: PG_OID.text, call: ([v]) => asString(v)?.trim() ?? null },
    ltrim: {
        oid: PG_OID.text,
        call: ([v]) => asString(v)?.trimStart() ?? null,
    },
    rtrim: { oid: PG_OID.text, call: ([v]) => asString(v)?.trimEnd() ?? null },
    length: { oid: PG_OID.int4, call: ([v]) => asString(v)?.length ?? null },
    char_length: {
        oid: PG_OID.int4,
        call: ([v]) => asString(v)?.length ?? null,
    },
    quote_ident: {
        oid: PG_OID.text,
        call: ([v]) =>
            v === null ? null : `"${String(v).replace(/"/g, '""')}"`,
    },
    quote_literal: {
        oid: PG_OID.text,
        call: ([v]) =>
            v === null ? null : `'${String(v).replace(/'/g, "''")}'`,
    },
    concat: {
        oid: PG_OID.text,
        call: (args, context) =>
            built(context, args.map((v) => asString(v) ?? '').join('')),
    },
    array_to_string: {
        oid: PG_OID.text,
        call: ([array, separator], context) =>
            Array.isArray(array)
                ? built(
                      context,
                      array
                          .filter((v) => v !== null)
                          .map(String)
                          .join(asString(separator) ?? ''),
                  )
                : null,
    },
    array_length: {
        oid: PG_OID.int4,
        call: ([array]) => (Array.isArray(array) ? array.length : null),
    },
    array_upper: {
        oid: PG_OID.int4,
        call: ([array]) => (Array.isArray(array) ? array.length : null),
    },
    array_lower: {
        oid: PG_OID.int4,
        call: ([array]) => (Array.isArray(array) ? 1 : null),
    },
    cardinality: {
        oid: PG_OID.int4,
        call: ([array]) => (Array.isArray(array) ? array.length : null),
    },
    abs: {
        oid: PG_OID.int8,
        call: ([v]) => (v === null ? null : Math.abs(Number(v))),
    },
    greatest: {
        oid: PG_OID.int8,
        call: (args) => {
            const numbers = args
                .map(asNumber)
                .filter((n): n is number => n !== null);
            return numbers.length ? Math.max(...numbers) : null;
        },
    },
    least: {
        oid: PG_OID.int8,
        call: (args) => {
            const numbers = args
                .map(asNumber)
                .filter((n): n is number => n !== null);
            return numbers.length ? Math.min(...numbers) : null;
        },
    },
    to_regclass: {
        oid: PG_OID.regclass,
        call: ([name], context) => {
            const text = asString(name);
            return text === null
                ? null
                : regclassOid(context.relations, context.catalog, text);
        },
    },
    unnest: {
        oid: PG_OID.text,
        call: ([array]) => (Array.isArray(array) ? array : []),
    },
    pg_relation_is_publishable: nullary(PG_OID.bool, false),
    pg_partition_ancestors: nullary(PG_OID.regclass, null),
    pg_partition_root: nullary(PG_OID.regclass, null),
    oidvectortypes: nullary(PG_OID.text, ''),
    pg_typeof: nullary(PG_OID.text, 'text'),
    generate_series: {
        oid: PG_OID.int4,
        call: ([from, to]) => {
            const start = asNumber(from);
            const end = asNumber(to);
            if (start === null || end === null || end - start > 10_000) {
                throw new PgWireServerError(
                    'generate_series is limited to 10000 values here',
                    '0A000',
                );
            }
            return Array.from(
                { length: Math.max(0, end - start + 1) },
                (_, i) => start + i,
            );
        },
    },
};

export const lookupFunction = (name: string): CatalogFunction | null =>
    CATALOG_FUNCTIONS[name.toLowerCase()] ?? null;
