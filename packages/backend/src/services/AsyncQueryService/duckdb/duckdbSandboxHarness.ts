import {
    DimensionType,
    ParameterError,
    type WarehouseResults,
} from '@lightdash/common';
import { z } from 'zod';
import { DUCKDB_SANDBOX_FIELD_TYPES } from './duckdbSandboxFieldTypes';

/** Where the runner, its inputs, spill space and outputs live inside the sandbox. */
export const DUCKDB_WORK_DIR = '/work';
export const DUCKDB_RUNNER_PATH = `${DUCKDB_WORK_DIR}/runner.py`;
export const DUCKDB_INPUT_DIR = `${DUCKDB_WORK_DIR}/in`;
export const DUCKDB_TEMP_DIR = `${DUCKDB_WORK_DIR}/tmp`;
export const DUCKDB_OUTPUT_DIR = `${DUCKDB_WORK_DIR}/out`;
export const DUCKDB_PROBE_SQL_PATH = `${DUCKDB_WORK_DIR}/probe.sql`;
export const DUCKDB_RUN_SQL_PATH = `${DUCKDB_WORK_DIR}/run.sql`;
export const DUCKDB_SETTINGS_PATH = `${DUCKDB_WORK_DIR}/settings.json`;
export const DUCKDB_OUTPUT_PROBE_PATH = `${DUCKDB_OUTPUT_DIR}/probe.json`;
export const DUCKDB_OUTPUT_RESULT_PATH = `${DUCKDB_OUTPUT_DIR}/result.jsonl`;
export const DUCKDB_OUTPUT_META_PATH = `${DUCKDB_OUTPUT_DIR}/meta.json`;

/** Largest result file read back from the sandbox, in bytes. */
export const DUCKDB_MAX_RESULT_BYTES = 64 * 1024 * 1024;

export type DuckdbSandboxSettings = {
    memoryLimit: string;
    threads: number;
};

const numericKindSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('integer') }),
    z.object({ kind: z.literal('decimal'), scale: z.number().int() }),
    z.object({ kind: z.literal('float') }),
]);

const fieldsSchema = z.record(
    z.string(),
    z.object({
        type: z.nativeEnum(DimensionType),
        numericKind: numericKindSchema.optional(),
    }),
);

const probeOutputSchema = z.object({ fields: fieldsSchema });

const runMetaSchema = z.object({
    fields: fieldsSchema,
    rowCount: z.number().int().nonnegative(),
});

export type DuckdbSandboxFields = WarehouseResults['fields'];
export type DuckdbProbeOutput = { fields: DuckdbSandboxFields };
export type DuckdbRunMeta = { fields: DuckdbSandboxFields; rowCount: number };

const parseOutput = <T>(
    raw: string,
    schema: z.ZodType<T>,
    label: string,
): T => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new ParameterError(`SQL ${label} is not valid JSON`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
        throw new ParameterError(
            `SQL ${label} is invalid: ${result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ')}`,
        );
    }
    return result.data;
};

export const parseDuckdbProbeOutput = (raw: string): DuckdbProbeOutput =>
    parseOutput(raw, probeOutputSchema, 'probe output');

export const parseDuckdbRunMeta = (raw: string): DuckdbRunMeta =>
    parseOutput(raw, runMetaSchema, 'result metadata');

/**
 * Runner executed inside the sandbox as
 * `python3 -I runner.py <probe|run> [workDir]` by the pinned `duckdb` Python
 * package in the image. It locks an in-memory DuckDB to `<workDir>/in`, runs
 * one SELECT and writes rows exactly as the server's DuckDB client
 * serialised them (`JSON.stringify` of node-api's JSON row objects).
 */
export const DUCKDB_RUNNER_SOURCE = String.raw`import json
import math
import os
import re
import sys

import duckdb

# Field types by DuckDBPyType.id (duckdbSandboxFieldTypes.ts); others are strings.
FIELD_TYPES = json.loads(${JSON.stringify(JSON.stringify(DUCKDB_SANDBOX_FIELD_TYPES))})

# Values node-api's JSON converter emits as JSON numbers or booleans as they are.
NATIVE_TYPES = {
    "boolean", "tinyint", "smallint", "integer", "utinyint", "usmallint",
    "uinteger", "float", "double",
}

BATCH_SIZE = 2048
ARRAY_INDEX = re.compile(r"^(0|[1-9][0-9]{0,9})$")


class RunnerError(Exception):
    pass


def sql_string(value):
    return "'" + value.replace("'", "''") + "'"


def sql_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def children(duckdb_type):
    return list(duckdb_type.children)


def convert(expr, duckdb_type, depth=0):
    """SQL that turns a value into what node-api's JSON converter emits, plus a
    Python step for what SQL cannot express (None when there is none)."""
    type_id = duckdb_type.id
    if type_id in NATIVE_TYPES:
        return expr, None
    if type_id == "interval":
        part = lambda name: "datepart('" + name + "', " + expr + ")"
        return (
            "CASE WHEN " + expr + " IS NULL THEN NULL ELSE struct_pack("
            + "months := CAST(" + part("year") + " * 12 + " + part("month") + " AS BIGINT), "
            + "days := CAST(" + part("day") + " AS BIGINT), "
            + "micros := CAST(" + part("hour") + " * 3600000000 + " + part("minute")
            + " * 60000000 + " + part("microseconds") + " AS VARCHAR)) END",
            None,
        )
    if type_id in ("list", "array"):
        variable = "v" + str(depth)
        child_sql, child_post = convert(variable, children(duckdb_type)[0][1], depth + 1)
        post = None
        if child_post is not None:
            post = lambda value: None if value is None else [child_post(item) for item in value]
        if child_sql == variable:
            return expr, post
        return (
            "list_transform(" + expr + ", lambda " + variable + ": " + child_sql + ")",
            post,
        )
    if type_id == "struct":
        entries = []
        posts = {}
        changed = False
        for name, child_type in children(duckdb_type):
            child_expr = "struct_extract(" + expr + ", " + sql_string(name) + ")"
            child_sql, child_post = convert(child_expr, child_type, depth + 1)
            changed = changed or child_sql != child_expr
            entries.append(sql_identifier(name) + " := " + child_sql)
            if child_post is not None:
                posts[name] = child_post
        post = None
        if posts:
            def post(value):
                if value is None:
                    return None
                return {key: posts[key](item) if key in posts else item for key, item in value.items()}
        if not changed:
            return expr, post
        return (
            "CASE WHEN " + expr + " IS NULL THEN NULL ELSE struct_pack("
            + ", ".join(entries) + ") END",
            post,
        )
    if type_id == "map":
        variable = "e" + str(depth)
        types = dict(children(duckdb_type))
        key_sql, key_post = convert("struct_extract(" + variable + ", 'key')", types["key"], depth + 1)
        value_sql, value_post = convert("struct_extract(" + variable + ", 'value')", types["value"], depth + 1)
        post = None
        if key_post is not None or value_post is not None:
            same = lambda item: item
            convert_key = key_post or same
            convert_value = value_post or same
            post = lambda value: None if value is None else [
                {"key": convert_key(entry["key"]), "value": convert_value(entry["value"])}
                for entry in value
            ]
        return (
            "list_transform(map_entries(" + expr + "), lambda " + variable
            + ": struct_pack(key := " + key_sql + ", value := " + value_sql + "))",
            post,
        )
    if type_id == "union":
        tag = "CAST(union_tag(" + expr + ") AS VARCHAR)"
        branches = []
        for name, member_type in children(duckdb_type)[1:]:
            member_sql, _ = convert(
                "union_extract(" + expr + ", " + sql_string(name) + ")", member_type, depth + 1
            )
            branches.append(
                "WHEN " + sql_string(name) + " THEN CAST(to_json(" + member_sql + ") AS VARCHAR)"
            )
        def post(value):
            if value is None:
                return None
            member = value["value"]
            return {"tag": value["tag"], "value": None if member is None else json.loads(member)}
        return (
            "CASE WHEN " + expr + " IS NULL THEN NULL ELSE struct_pack(tag := " + tag
            + ", value := CASE " + tag + " " + " ".join(branches) + " END) END",
            post,
        )
    # BIGINT and wider integers, DECIMAL, VARCHAR, dates and times, BLOB, UUID, ...
    return "CAST(" + expr + " AS VARCHAR)", None


def field_for(duckdb_type):
    entry = FIELD_TYPES.get(duckdb_type.id, {"type": "string", "numericKind": None})
    field = {"type": entry["type"]}
    kind = entry["numericKind"]
    if kind == "decimal":
        field["numericKind"] = {"kind": "decimal", "scale": dict(children(duckdb_type))["scale"]}
    elif kind is not None:
        field["numericKind"] = {"kind": kind}
    return field


def dump_string(value):
    return json.dumps(value, ensure_ascii=False)


def dump_float(value):
    """A float as JavaScript's Number#toString writes it."""
    if math.isnan(value):
        return '"NaN"'
    if math.isinf(value):
        return '"Infinity"' if value > 0 else '"-Infinity"'
    if value == 0:
        return "0"
    text = repr(abs(value))
    mantissa, _, exponent = text.partition("e")
    whole, _, fraction = mantissa.partition(".")
    digits = whole + fraction
    point = len(whole) + (int(exponent) if exponent else 0)
    stripped = digits.lstrip("0")
    point -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    count = len(digits)
    if count <= point <= 21:
        result = digits + "0" * (point - count)
    elif 0 < point <= 21:
        result = digits[:point] + "." + digits[point:]
    elif -6 < point <= 0:
        result = "0." + "0" * -point + digits
    else:
        power = point - 1
        result = (digits[0] + ("." + digits[1:] if count > 1 else "")
                  + "e" + ("+" if power >= 0 else "-") + str(abs(power)))
    return ("-" if value < 0 else "") + result


def object_key_order(keys):
    """JavaScript object key order: array indices ascending, then insertion order."""
    indices = sorted(
        (key for key in keys if ARRAY_INDEX.match(key) and int(key) <= 4294967294),
        key=int,
    )
    index_set = set(indices)
    return indices + [key for key in keys if key not in index_set]


def dump(value):
    if value is None:
        return "null"
    kind = type(value)
    if kind is str:
        return dump_string(value)
    if kind is bool:
        return "true" if value else "false"
    if kind is int:
        return str(value)
    if kind is float:
        return dump_float(value)
    if kind is list or kind is tuple:
        return "[" + ",".join(dump(item) for item in value) + "]"
    if kind is dict:
        return "{" + ",".join(
            dump_string(key) + ":" + dump(value[key]) for key in object_key_order(list(value))
        ) + "}"
    return dump_string(str(value))


def open_session(work_dir):
    with open(os.path.join(work_dir, "settings.json"), encoding="utf-8") as file:
        settings = json.load(file)
    connection = duckdb.connect(":memory:")
    for statement in (
        "SET allowed_directories = [" + sql_string(os.path.join(work_dir, "in")) + "]",
        "SET temp_directory = " + sql_string(os.path.join(work_dir, "tmp")),
        "SET memory_limit = " + sql_string(str(settings["memoryLimit"])),
        "SET threads = " + str(int(settings["threads"])),
        "SET allow_community_extensions = false",
        "SET autoinstall_known_extensions = false",
        "SET autoload_known_extensions = false",
        "SET allow_unredacted_secrets = false",
        "SET python_enable_replacements = false",
        # Server pods and sandboxes run in UTC; pin it so TIMESTAMPTZ reads and prints the same anywhere.
        "SET TimeZone = 'UTC'",
        "SET enable_external_access = false",
        "SET lock_configuration = true",
    ):
        connection.execute(statement)
    return connection


def prepare(connection, sql):
    statements = connection.extract_statements(sql)
    if len(statements) == 0:
        raise RunnerError("SQL validation error: empty SQL statement")
    if len(statements) > 1:
        raise RunnerError("SQL validation error: multiple SQL statements are not allowed")
    if statements[0].type != duckdb.StatementType.SELECT:
        raise RunnerError(
            "SQL validation error: only SELECT statements are allowed (got statement type "
            + statements[0].type.name + ")"
        )
    relation = connection.sql(sql)
    names = list(relation.columns)
    types = list(relation.types)
    fields = {}
    for name, duckdb_type in zip(names, types):
        fields[name] = field_for(duckdb_type)
    projections = []
    posts = []
    for index, duckdb_type in enumerate(types):
        column = "#" + str(index + 1)
        column_sql, post = convert(column, duckdb_type)
        projections.append(column_sql)
        posts.append(post)
    if all(projection == "#" + str(index + 1) for index, projection in enumerate(projections)):
        projected = relation
    else:
        projected = relation.project(", ".join(projections))
    return names, posts, fields, projected


def row_keys(names):
    """node-api's deduplicated row keys: the second "a" becomes "a:1"."""
    seen = {}
    keys = []
    for name in names:
        seen[name] = seen.get(name, 0) + 1
        keys.append(name if seen[name] == 1 else name + ":" + str(seen[name] - 1))
    return keys


def row_writer(names, posts):
    """Rows keyed like node-api's row objects; a key that still repeats keeps its first position and last value."""
    names = row_keys(names)
    last_index = {}
    for index, name in enumerate(names):
        last_index[name] = index
    keys = object_key_order(list(dict.fromkeys(names)))
    columns = [
        (("{" if position == 0 else ",") + dump_string(key) + ":", last_index[key], posts[last_index[key]])
        for position, key in enumerate(keys)
    ]

    def write(row):
        parts = []
        for prefix, index, post in columns:
            value = row[index]
            parts.append(prefix + dump(value if post is None else post(value)))
        return ("".join(parts) + "}" if parts else "{}") + "\n"

    return write


def read_sql(work_dir, name):
    with open(os.path.join(work_dir, name), encoding="utf-8") as file:
        return file.read()


def write_json(path, value):
    with open(path, "w", encoding="utf-8") as file:
        file.write(dump(value))


def probe(work_dir, connection):
    _, _, fields, projected = prepare(connection, read_sql(work_dir, "probe.sql"))
    projected.fetchmany(1)
    write_json(os.path.join(work_dir, "out", "probe.json"), {"fields": fields})


def run(work_dir, connection):
    names, posts, fields, projected = prepare(connection, read_sql(work_dir, "run.sql"))
    write = row_writer(names, posts)
    row_count = 0
    with open(os.path.join(work_dir, "out", "result.jsonl"), "w", encoding="utf-8", newline="") as out:
        while True:
            rows = projected.fetchmany(BATCH_SIZE)
            if not rows:
                break
            row_count += len(rows)
            out.write("".join(write(row) for row in rows))
    write_json(os.path.join(work_dir, "out", "meta.json"), {"fields": fields, "rowCount": row_count})


def main(argv):
    if len(argv) < 1 or argv[0] not in ("probe", "run"):
        raise RunnerError("Usage: runner.py <probe|run> [workDir]")
    work_dir = argv[1] if len(argv) > 1 else "/work"
    os.makedirs(os.path.join(work_dir, "out"), exist_ok=True)
    connection = open_session(work_dir)
    if argv[0] == "probe":
        probe(work_dir, connection)
    else:
        run(work_dir, connection)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as error:
        sys.stderr.write(str(error) + "\n")
        sys.exit(1)
`;
