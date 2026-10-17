import {
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
    /** Harness phase durations; written next to user code, so telemetry only. */
    timingsMs: z
        .object({
            load: z.number().nonnegative(),
            run: z.number().nonnegative(),
            write: z.number().nonnegative(),
        })
        .optional(),
});

export type PythonResultMeta = z.infer<typeof pythonResultMetaSchema>;

/** Column metadata the harness receives for each input, so it can cast values. */
export type PythonInputMeta = {
    inputs: Record<string, { columns: Record<string, PythonColumnType> }>;
    params: Record<string, unknown>;
    limit: number;
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

const RESULT_BATCH_BYTES = 1024 * 1024;

const yieldToEventLoop = () =>
    new Promise<void>((resolve) => {
        setImmediate(resolve);
    });

/**
 * The sandbox output is written by a process that also ran user code, so it is
 * untrusted: every line must be a JSON object with exactly the declared
 * columns, and the row count must match the metadata and the limit. Lines are
 * checked in batches that yield the event loop and re-serialised as the
 * JSONL a result file holds, so nothing is uploaded until all of it passes.
 */
export const validatePythonResultRows = async (
    jsonl: Buffer,
    meta: PythonResultMeta,
    limit: number,
): Promise<{ chunks: string[]; rowCount: number }> => {
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
    const chunks: string[] = [];
    let rowCount = 0;
    let offset = 0;
    while (offset < jsonl.byteLength) {
        const newline = jsonl.indexOf(
            0x0a,
            Math.min(offset + RESULT_BATCH_BYTES, jsonl.byteLength - 1),
        );
        const end = newline === -1 ? jsonl.byteLength : newline + 1;
        const lines = jsonl
            .toString('utf8', offset, end)
            .split('\n')
            .filter((line) => line.length > 0);
        if (rowCount + lines.length > meta.rowCount) {
            throw new ParameterError(
                `Python result declares ${meta.rowCount} rows but the file has more`,
            );
        }
        const firstRow = rowCount + 1;
        const normalised = lines.map((line, index) => {
            const rowNumber = firstRow + index;
            let row: unknown;
            try {
                row = JSON.parse(line);
            } catch {
                throw new ParameterError(
                    `Python result row ${rowNumber} is not valid JSON`,
                );
            }
            if (row === null || typeof row !== 'object' || Array.isArray(row)) {
                throw new ParameterError(
                    `Python result row ${rowNumber} is not an object`,
                );
            }
            const keys = Object.keys(row);
            if (
                keys.length !== expected.size ||
                keys.some((key) => !expected.has(key))
            ) {
                throw new ParameterError(
                    `Python result row ${rowNumber} does not match the declared columns`,
                );
            }
            return `${JSON.stringify(row)}\n`;
        });
        rowCount += lines.length;
        chunks.push(normalised.join(''));
        offset = end;
        // eslint-disable-next-line no-await-in-loop
        await yieldToEventLoop();
    }
    if (rowCount !== meta.rowCount) {
        throw new ParameterError(
            `Python result declares ${meta.rowCount} rows but the file has ${rowCount}`,
        );
    }
    return { chunks, rowCount };
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
): Record<string, PythonColumnType> =>
    Object.fromEntries(
        Object.values(columns).map((column) => [
            column.reference,
            toPythonColumnType(column.type),
        ]),
    );

/**
 * The harness that runs inside the sandbox. It owns the file contract:
 * inputs are loaded as typed DataFrames, user `run()` is called, and the
 * returned DataFrame is validated, truncated and serialised. Reading and
 * writing are columnar (pyarrow in, polars out) with a row-wise fallback for
 * values the columnar paths would encode differently. The backend
 * re-validates everything it reads back, so this is a convenience, not the
 * trust boundary.
 */
export const PYTHON_RUNNER_SOURCE = `
import importlib.util
import json
import math
import os
import re
import sys
import time
import traceback

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.json as pa_json

WORK = "${PYTHON_WORK_DIR}"
IN_DIR = f"{WORK}/in"
OUT_DIR = f"{WORK}/out"
COLUMN_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
# Below this many cells the row-wise writer beats importing polars
COLUMNAR_MIN_CELLS = 20_000


def fail(message):
    sys.stderr.write(message + "\\n")
    sys.exit(1)


def read_arrow(path, spec):
    """Columnar parse; raises on anything the row-wise reader handles differently."""
    if os.path.getsize(path) == 0:
        raise ValueError("empty input")
    # Number columns are inferred so integer columns stay int64, as with pandas
    schema = pa.schema(
        [
            (column, pa.bool_() if kind == "boolean" else pa.string())
            for column, kind in spec["columns"].items()
            if kind != "number"
        ]
    )
    table = pa_json.read_json(
        path,
        parse_options=pa_json.ParseOptions(
            explicit_schema=schema, unexpected_field_behavior="infer"
        ),
    )
    present = [column for column in spec["columns"] if column in table.column_names]
    frame = table.select(present).to_pandas(
        types_mapper={pa.bool_(): pd.BooleanDtype()}.get
    )
    for column in spec["columns"]:
        if column not in frame.columns:
            frame[column] = None
    return frame[list(spec["columns"])]


def read_rows(path, spec):
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return pd.DataFrame(rows, columns=list(spec["columns"].keys()))


def load_input(name, spec):
    path = f"{IN_DIR}/{name}.jsonl"
    try:
        frame = read_arrow(path, spec)
    except Exception:
        frame = read_rows(path, spec)
    for column, kind in spec["columns"].items():
        if kind == "number":
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        elif kind == "boolean":
            if not isinstance(frame[column].dtype, pd.BooleanDtype):
                frame[column] = frame[column].map(
                    lambda value: pd.NA if pd.isna(value) else bool(value)
                ).astype("boolean")
        elif kind in ("date", "timestamp"):
            frame[column] = pd.to_datetime(frame[column], errors="coerce", utc=(kind == "timestamp"))
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
        return value.isoformat()
    if isinstance(value, np.generic):
        value = value.item()
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return value
    if kind == "string":
        return str(value)
    return value


def write_rows(result, names, kinds, path):
    records = result.to_dict(orient="records")
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            row = {name: to_json_value(record[name], kinds[name]) for name in names}
            handle.write(json.dumps(row, allow_nan=False) + "\\n")


def write_columnar(result, names, kinds, path):
    """Vectorised writer; raises for any column it cannot encode like write_rows."""
    import polars as pl

    frame = pl.from_pandas(result)
    expressions = []
    for name in names:
        kind = kinds[name]
        dtype = frame.schema[name]
        column = pl.col(name)
        if kind == "boolean" and dtype == pl.Boolean:
            expressions.append(column)
        elif kind == "number" and dtype.is_float():
            column = column.cast(pl.Float64)
            expressions.append(pl.when(column.is_finite()).then(column))
        elif kind == "number" and dtype.is_integer():
            expressions.append(column)
        elif kind == "timestamp" and isinstance(dtype, pl.Datetime):
            offset = "%:z" if dtype.time_zone else ""
            expressions.append(column.dt.to_string(f"%Y-%m-%dT%H:%M:%S%.f{offset}"))
        elif kind == "string" and dtype == pl.Date:
            expressions.append(column.dt.to_string("%Y-%m-%d"))
        elif kind == "string" and dtype in (pl.String, pl.Categorical, pl.Null):
            expressions.append(column.cast(pl.String))
        else:
            raise TypeError(f"{name}: {dtype} has no columnar encoding")
    frame.select(expressions).write_ndjson(path)


def main():
    with open(f"{IN_DIR}/meta.json", encoding="utf-8") as handle:
        meta = json.load(handle)

    started = time.perf_counter()
    inputs = {name: load_input(name, spec) for name, spec in meta["inputs"].items()}
    loaded = time.perf_counter()

    spec = importlib.util.spec_from_file_location("user_main", f"{WORK}/main.py")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        fail("Python code failed to load:\\n" + traceback.format_exc())

    run = getattr(module, "run", None)
    if not callable(run):
        fail("Python code must define run(inputs, params)")

    try:
        result = run(inputs, meta.get("params", {}))
    except Exception:
        fail("run() raised:\\n" + traceback.format_exc())
    ran = time.perf_counter()

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
    os.makedirs(OUT_DIR, exist_ok=True)
    result_path = f"{OUT_DIR}/result.jsonl"
    written = False
    if len(result) * len(names) >= COLUMNAR_MIN_CELLS:
        try:
            write_columnar(result, names, kinds, result_path)
            written = True
        except Exception:
            pass
    if not written:
        write_rows(result, names, kinds, result_path)

    with open(f"{OUT_DIR}/meta.json", "w", encoding="utf-8") as handle:
        json.dump(
            {
                "columns": [{"name": name, "type": kinds[name]} for name in names],
                "rowCount": len(result),
                "truncated": truncated,
                "timingsMs": {
                    "load": round((loaded - started) * 1000, 1),
                    "run": round((ran - loaded) * 1000, 1),
                    "write": round((time.perf_counter() - ran) * 1000, 1),
                },
            },
            handle,
        )


if __name__ == "__main__":
    main()
`;
