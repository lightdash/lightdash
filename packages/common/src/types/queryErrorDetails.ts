import { z } from 'zod';

/** Why a query failed, classified where the error was thrown. Never derived from the message. */
export const QUERY_ERROR_CODES = [
    'duckdb_parse',
    'duckdb_bind',
    'duckdb_runtime',
    'python_compile',
    'python_load',
    'python_run',
    'python_output',
    'python_timeout',
    'bigquery_bytes_billed_limit',
    'bigquery_access_denied',
    'bigquery_invalid_query',
    'bigquery_quota_exceeded',
    'bigquery_rate_limit_exceeded',
    'bigquery_resources_exceeded',
    'bigquery_response_too_large',
    'bigquery_not_found',
    'bigquery_stopped',
    'bigquery_invalid',
    'bigquery_other',
    'query_cost_estimate_exceeded',
    'missing_warehouse_credentials',
    'warehouse_timeout',
    'access_refused',
    'warehouse_other',
    'unknown',
] as const;

export const queryErrorCodeSchema = z.enum(QUERY_ERROR_CODES);
export type QueryErrorCode = z.infer<typeof queryErrorCodeSchema>;

/** Built-in and library exception names; any other name, e.g. a class in user code, reports as `other`. */
export const PYTHON_EXCEPTION_TYPES = [
    'ArithmeticError',
    'AssertionError',
    'AttributeError',
    'AxisError',
    'DataError',
    'Exception',
    'FileNotFoundError',
    'ImportError',
    'IndentationError',
    'IndexError',
    'IntCastingNaNError',
    'InvalidIndexError',
    'KeyError',
    'LinAlgError',
    'LookupError',
    'MemoryError',
    'MergeError',
    'ModuleNotFoundError',
    'NameError',
    'NotImplementedError',
    'OSError',
    'OutOfBoundsDatetime',
    'OverflowError',
    'ParserError',
    'RecursionError',
    'RuntimeError',
    'StopIteration',
    'SyntaxError',
    'TimeoutError',
    'TypeError',
    'UnboundLocalError',
    'UnicodeDecodeError',
    'UnicodeEncodeError',
    'UnicodeError',
    'ValueError',
    'ZeroDivisionError',
    'other',
] as const;

export const pythonExceptionTypeSchema = z.enum(PYTHON_EXCEPTION_TYPES);
export type PythonExceptionType = z.infer<typeof pythonExceptionTypeSchema>;

export const toPythonExceptionType = (name: unknown): PythonExceptionType => {
    const parsed = pythonExceptionTypeSchema.safeParse(name);
    return parsed.success ? parsed.data : 'other';
};

export const queryErrorDetailsSchema = z
    .object({
        code: queryErrorCodeSchema,
        pythonExceptionType: pythonExceptionTypeSchema.nullable(),
    })
    .strict();

export type QueryErrorDetails = z.infer<typeof queryErrorDetailsSchema>;
