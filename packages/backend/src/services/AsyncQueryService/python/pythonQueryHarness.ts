import {
    convertItemTypeToDimensionType,
    DimensionType,
    FieldType,
    ParameterError,
    type Dimension,
    type ItemsMap,
    type ResultColumns,
} from '@lightdash/common';
import { z } from 'zod';

/** Where the harness, the user code, inputs and outputs live inside the sandbox. */
export const PYTHON_WORK_DIR = '/work';
export const PYTHON_MAIN_PATH = `${PYTHON_WORK_DIR}/main.py`;
export const PYTHON_RUNNER_PATH = `${PYTHON_WORK_DIR}/runner.py`;
export const PYTHON_INPUT_DIR = `${PYTHON_WORK_DIR}/in`;
export const PYTHON_INPUT_META_PATH = `${PYTHON_INPUT_DIR}/meta.json`;
export const PYTHON_OUTPUT_DIR = `${PYTHON_WORK_DIR}/out`;
export const PYTHON_OUTPUT_RESULT_PATH = `${PYTHON_OUTPUT_DIR}/result.jsonl`;
export const PYTHON_OUTPUT_META_PATH = `${PYTHON_OUTPUT_DIR}/meta.json`;

/** Largest python source accepted, in bytes. */
export const PYTHON_MAX_CODE_BYTES = 64 * 1024;
/** Largest result file read back from the sandbox, in bytes. */
export const PYTHON_MAX_RESULT_BYTES = 64 * 1024 * 1024;

const PYTHON_COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const RUN_SIGNATURE = /^\s*def\s+run\s*\(/m;

/**
 * Cheap checks that need no python: refuse what would fail or be abusive
 * before a sandbox is created. Real syntax checking happens in the sandbox
 * with py_compile.
 */
export const validatePythonCode = (code: string): void => {
    if (code.trim().length === 0) {
        throw new ParameterError('Python code must not be empty');
    }
    if (Buffer.byteLength(code, 'utf8') > PYTHON_MAX_CODE_BYTES) {
        throw new ParameterError(
            `Python code must be at most ${PYTHON_MAX_CODE_BYTES} bytes`,
        );
    }
    if (!RUN_SIGNATURE.test(code)) {
        throw new ParameterError(
            'Python code must define `def run(inputs, params)` returning a pandas DataFrame',
        );
    }
};

/** Types the harness reports for output columns; a subset of DimensionType by name. */
const pythonColumnTypeSchema = z.enum([
    'number',
    'string',
    'boolean',
    'date',
    'timestamp',
]);

export type PythonColumnType = z.infer<typeof pythonColumnTypeSchema>;

const pythonResultMetaSchema = z.object({
    columns: z
        .array(
            z.object({
                name: z.string().regex(PYTHON_COLUMN_NAME),
                type: pythonColumnTypeSchema,
            }),
        )
        .min(1),
    rowCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    timings: z.object({
        importMs: z.number().nonnegative(),
        loadInputsMs: z.number().nonnegative(),
        loadCodeMs: z.number().nonnegative(),
        runMs: z.number().nonnegative(),
        writeOutputMs: z.number().nonnegative(),
        downloadInputsMs: z.number().nonnegative().optional(),
        uploadOutputMs: z.number().nonnegative().optional(),
    }),
});

export type PythonResultMeta = z.infer<typeof pythonResultMetaSchema>;

/** Column metadata the harness receives for each input, so it can cast values. */
export type PythonInputMeta = {
    inputs: Record<string, { columns: Record<string, PythonColumnType> }>;
    params: Record<string, unknown>;
    limit: number;
};

/** Presigned storage URLs the harness moves bytes through; hosts pin each URL host to the IPs egress allows. */
export type PythonTransfer = {
    hosts: Record<string, string[]>;
    inputs: Record<string, string>;
    result: string;
};

export const parsePythonResultMeta = (raw: string): PythonResultMeta => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new ParameterError('Python result metadata is not valid JSON');
    }
    const result = pythonResultMetaSchema.safeParse(parsed);
    if (!result.success) {
        throw new ParameterError(
            `Python result metadata is invalid: ${result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ')}`,
        );
    }
    const names = result.data.columns.map((column) => column.name);
    if (new Set(names).size !== names.length) {
        throw new ParameterError('Python result has duplicate column names');
    }
    return result.data;
};

/**
 * The sandbox output is written by a process that also ran user code, so it is
 * untrusted: every line must be a JSON object with exactly the declared
 * columns, and the row count must match the metadata and the limit.
 */
export const validatePythonResultRows = (
    jsonl: Buffer,
    meta: PythonResultMeta,
    limit: number,
): Record<string, unknown>[] => {
    if (jsonl.byteLength > PYTHON_MAX_RESULT_BYTES) {
        throw new ParameterError(
            `Python result exceeds ${PYTHON_MAX_RESULT_BYTES} bytes`,
        );
    }
    if (meta.rowCount > limit) {
        throw new ParameterError(
            `Python result has ${meta.rowCount} rows, above the limit of ${limit}`,
        );
    }
    const expected = new Set(meta.columns.map((column) => column.name));
    const lines = jsonl
        .toString('utf8')
        .split('\n')
        .filter((line) => line.length > 0);
    if (lines.length !== meta.rowCount) {
        throw new ParameterError(
            `Python result declares ${meta.rowCount} rows but the file has ${lines.length}`,
        );
    }
    return lines.map((line, index) => {
        let row: unknown;
        try {
            row = JSON.parse(line);
        } catch {
            throw new ParameterError(
                `Python result row ${index + 1} is not valid JSON`,
            );
        }
        if (row === null || typeof row !== 'object' || Array.isArray(row)) {
            throw new ParameterError(
                `Python result row ${index + 1} is not an object`,
            );
        }
        const keys = Object.keys(row);
        if (
            keys.length !== expected.size ||
            keys.some((key) => !expected.has(key))
        ) {
            throw new ParameterError(
                `Python result row ${
                    index + 1
                } does not match the declared columns`,
            );
        }
        return row as Record<string, unknown>;
    });
};

const toDimensionType = (type: PythonColumnType): DimensionType => {
    switch (type) {
        case 'number':
            return DimensionType.NUMBER;
        case 'boolean':
            return DimensionType.BOOLEAN;
        case 'date':
            return DimensionType.DATE;
        case 'timestamp':
            return DimensionType.TIMESTAMP;
        case 'string':
            return DimensionType.STRING;
        default:
            return DimensionType.STRING;
    }
};

const toPythonColumnType = (type: DimensionType): PythonColumnType => {
    switch (type) {
        case DimensionType.NUMBER:
            return 'number';
        case DimensionType.BOOLEAN:
            return 'boolean';
        case DimensionType.DATE:
            return 'date';
        case DimensionType.TIMESTAMP:
            return 'timestamp';
        case DimensionType.STRING:
            return 'string';
        default:
            return 'string';
    }
};

export const pythonResultToColumns = (meta: PythonResultMeta): ResultColumns =>
    Object.fromEntries(
        meta.columns.map((column) => [
            column.name,
            { reference: column.name, type: toDimensionType(column.type) },
        ]),
    );

/** Fields shaped like SQL-runner results so paging and formatting work unchanged. */
export const pythonColumnsToFields = (columns: ResultColumns): ItemsMap =>
    Object.fromEntries(
        Object.values(columns).map<[string, Dimension]>((column) => [
            column.reference,
            {
                name: column.reference,
                label: column.reference,
                type: column.type,
                table: '',
                fieldType: FieldType.DIMENSION,
                sql: '',
                tableLabel: '',
                hidden: false,
            },
        ]),
    );

export const pythonResultToFields = (meta: PythonResultMeta): ItemsMap =>
    pythonColumnsToFields(pythonResultToColumns(meta));

/** Column types of a referenced result, as the harness reads them. */
export const resultColumnsToPythonInput = (
    columns: ResultColumns,
    itemsMap: ItemsMap,
): Record<string, PythonColumnType> =>
    Object.fromEntries(
        Object.values(columns).map((column) => {
            const item = itemsMap[column.reference];
            // Truncating a date can return a warehouse timestamp (Postgres DATE_TRUNC).
            const isTruncatedDate =
                column.type === DimensionType.TIMESTAMP &&
                item !== undefined &&
                convertItemTypeToDimensionType(item) === DimensionType.DATE;
            return [
                column.reference,
                toPythonColumnType(
                    isTruncatedDate ? DimensionType.DATE : column.type,
                ),
            ];
        }),
    );

/**
 * The harness that runs inside the sandbox. It owns the file contract:
 * inputs are loaded as typed DataFrames, user `run()` is called, and the
 * returned DataFrame is validated, truncated and serialised. The backend
 * re-validates everything it reads back, so this is a convenience, not the
 * trust boundary.
 */
export const PYTHON_RUNNER_SOURCE = `
import time

STARTED = time.perf_counter()

import importlib.util
import json
import math
import re
import sys
import traceback

import numpy as np
import pandas as pd

TIMINGS = {"importMs": (time.perf_counter() - STARTED) * 1000}

WORK = "${PYTHON_WORK_DIR}"
IN_DIR = f"{WORK}/in"
OUT_DIR = f"{WORK}/out"
COLUMN_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")


def fail(message):
    sys.stderr.write(message + "\\n")
    sys.exit(1)


def load_input(name, spec):
    rows = []
    with open(f"{IN_DIR}/{name}.jsonl", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    columns = list(spec["columns"].keys())
    frame = pd.DataFrame(rows, columns=columns)
    for column, kind in spec["columns"].items():
        if kind == "number":
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        elif kind == "boolean":
            frame[column] = frame[column].map(
                lambda value: pd.NA if pd.isna(value) else bool(value)
            ).astype("boolean")
        elif kind in ("date", "timestamp"):
            parsed = pd.to_datetime(frame[column], errors="coerce", utc=True)
            if kind == "date":
                # tz-naive so user code can compare against naive Timestamps and date_range()
                parsed = parsed.dt.tz_localize(None).dt.normalize()
            frame[column] = parsed
        else:
            frame[column] = frame[column].astype("string")
    return frame


def column_type(series):
    dtype = series.dtype
    if pd.api.types.is_bool_dtype(dtype):
        return "boolean"
    if pd.api.types.is_numeric_dtype(dtype):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        non_null = series.dropna()
        is_naive = getattr(dtype, "tz", None) is None
        if is_naive and bool((non_null == non_null.dt.normalize()).all()):
            return "date"
        return "timestamp"
    return "string"


def to_json_value(value, kind):
    if value is None or value is pd.NA:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if value is pd.NaT:
        return None
    if isinstance(value, (pd.Timestamp,)):
        if value.tzinfo is None:
            value = value.tz_localize("UTC")
        return value.isoformat()
    if isinstance(value, np.generic):
        value = value.item()
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    if kind == "string":
        return str(value)
    return value


def timed(name, started):
    TIMINGS[name] = (time.perf_counter() - started) * 1000


def transfer(method, url, hosts, body=None):
    # Connects to a pinned IP: the sandbox has no DNS
    import http.client
    import socket
    import ssl
    import urllib.parse

    parts = urllib.parse.urlsplit(url)
    https = parts.scheme == "https"
    port = parts.port or (443 if https else 80)
    sock = None
    for ip in hosts[parts.hostname]:
        try:
            sock = socket.create_connection((ip, port), timeout=60)
            break
        except OSError:
            continue
    if sock is None:
        fail(f"Could not connect to storage for {method}")
    if https:
        sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parts.hostname)
        connection = http.client.HTTPSConnection(parts.hostname, port, timeout=60)
    else:
        connection = http.client.HTTPConnection(parts.hostname, port, timeout=60)
    connection.sock = sock
    headers = {} if body is None else {"Content-Type": "application/jsonl"}
    target = parts.path + (f"?{parts.query}" if parts.query else "")
    connection.request(method, target, body=body, headers=headers)
    response = connection.getresponse()
    data = response.read()
    connection.close()
    if response.status >= 300:
        fail(f"Storage {method} failed with HTTP {response.status}")
    return data


def main():
    started = time.perf_counter()
    with open(f"{IN_DIR}/meta.json", encoding="utf-8") as handle:
        meta = json.load(handle)

    moved = meta.get("transfer")
    if moved:
        for name, url in moved["inputs"].items():
            with open(f"{IN_DIR}/{name}.jsonl", "wb") as handle:
                handle.write(transfer("GET", url, moved["hosts"]))
        timed("downloadInputsMs", started)
        started = time.perf_counter()

    inputs = {name: load_input(name, spec) for name, spec in meta["inputs"].items()}
    timed("loadInputsMs", started)

    started = time.perf_counter()
    spec = importlib.util.spec_from_file_location("user_main", f"{WORK}/main.py")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        fail("Python code failed to load:\\n" + traceback.format_exc())

    run = getattr(module, "run", None)
    if not callable(run):
        fail("Python code must define run(inputs, params)")

    timed("loadCodeMs", started)

    started = time.perf_counter()
    try:
        result = run(inputs, meta.get("params", {}))
    except Exception:
        fail("run() raised:\\n" + traceback.format_exc())
    timed("runMs", started)

    started = time.perf_counter()

    if not isinstance(result, pd.DataFrame):
        fail(f"run() must return a pandas DataFrame, got {type(result).__name__}")
    if result.shape[1] == 0:
        fail("run() returned a DataFrame with no columns")

    result = result.reset_index(drop=True)
    names = [str(column) for column in result.columns]
    for name in names:
        if not COLUMN_NAME.match(name):
            fail(f"Column name {name!r} is not a valid identifier")
    if len(set(names)) != len(names):
        fail("Returned DataFrame has duplicate column names")
    result.columns = names

    limit = int(meta["limit"])
    truncated = len(result) > limit
    if truncated:
        result = result.iloc[:limit]

    kinds = {name: column_type(result[name]) for name in names}
    records = result.to_dict(orient="records")
    with open(f"{OUT_DIR}/result.jsonl", "w", encoding="utf-8") as handle:
        for record in records:
            row = {name: to_json_value(record[name], kinds[name]) for name in names}
            handle.write(json.dumps(row, allow_nan=False) + "\\n")
    timed("writeOutputMs", started)

    if moved:
        started = time.perf_counter()
        with open(f"{OUT_DIR}/result.jsonl", "rb") as handle:
            transfer("PUT", moved["result"], moved["hosts"], handle.read())
        timed("uploadOutputMs", started)

    with open(f"{OUT_DIR}/meta.json", "w", encoding="utf-8") as handle:
        json.dump(
            {
                "columns": [{"name": name, "type": kinds[name]} for name in names],
                "rowCount": len(records),
                "truncated": truncated,
                "timings": TIMINGS,
            },
            handle,
        )


if __name__ == "__main__":
    main()
`;
