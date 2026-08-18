import { assertUnreachable } from '@lightdash/common';
import {
    BINARY_FORMAT,
    FALSE_LITERALS,
    PG_OID,
    TEXT_FORMAT,
    TRUE_LITERALS,
} from './pgTypes';
import { PgWireServerError } from './PgWireServerError';

/**
 * Decoders for the extended query protocol frontend messages (Parse, Bind,
 * Describe, Execute, Close) and the parameter inlining that turns a bound
 * statement back into plain SQL for the compiler.
 *
 * Message layouts: https://www.postgresql.org/docs/current/protocol-message-formats.html
 */

/** Postgres' own limit; also what fits the uint16 count in ParameterDescription */
export const MAX_PARAMETERS = 65535;

/**
 * A statement with parameters inlined may not exceed what a simple-query
 * message could carry, so repeating a large value many times cannot amplify
 * a small request into a huge SQL string.
 */
export const MAX_INLINED_SQL_LENGTH = 1024 * 1024;

const NUMERIC_OIDS = new Set<number>([
    PG_OID.int2,
    PG_OID.int4,
    PG_OID.int8,
    PG_OID.float4,
    PG_OID.float8,
    PG_OID.numeric,
]);

export type ParseMessage = {
    statementName: string;
    sql: string;
    /** 0 = unspecified by the client */
    parameterOids: number[];
};

export type BindMessage = {
    portalName: string;
    statementName: string;
    /** one entry per parameter */
    parameterFormats: number[];
    /** raw parameter bytes; null for SQL NULL */
    parameters: (Buffer | null)[];
    /** as sent: none (all text), one for every column, or one per column */
    resultFormats: number[];
};

export type DescribeMessage = { kind: 'S' | 'P'; name: string };

export type CloseMessage = { kind: 'S' | 'P'; name: string };

export type ExecuteMessage = {
    portalName: string;
    /** 0 = no limit */
    maxRows: number;
};

const protocolViolation = (message: string): PgWireServerError =>
    new PgWireServerError(message, '08P01');

class PayloadReader {
    private offset = 0;

    constructor(private readonly payload: Buffer) {}

    cstring(): string {
        const end = this.payload.indexOf(0, this.offset);
        if (end === -1) {
            throw PayloadReader.truncated();
        }
        const value = this.payload.toString('utf8', this.offset, end);
        this.offset = end + 1;
        return value;
    }

    byte(): number {
        this.ensure(1);
        const value = this.payload[this.offset];
        this.offset += 1;
        return value;
    }

    int16(): number {
        this.ensure(2);
        const value = this.payload.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    uint16(): number {
        this.ensure(2);
        const value = this.payload.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    int32(): number {
        this.ensure(4);
        const value = this.payload.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    bytes(length: number): Buffer {
        if (length < 0) {
            throw protocolViolation(`invalid length ${length} in message`);
        }
        this.ensure(length);
        const value = this.payload.subarray(this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    private ensure(length: number): void {
        if (this.offset + length > this.payload.length) {
            throw PayloadReader.truncated();
        }
    }

    private static truncated(): PgWireServerError {
        return protocolViolation('insufficient data left in message');
    }
}

/** Counts on the wire are unsigned (Postgres reads them with pq_getmsgint) */
const readCount = (reader: PayloadReader): number => reader.uint16();

const readTimes = <T>(count: number, read: () => T): T[] =>
    Array.from({ length: count }, read);

const readKind = (reader: PayloadReader): 'S' | 'P' => {
    const kind = String.fromCharCode(reader.byte());
    if (kind !== 'S' && kind !== 'P') {
        throw protocolViolation(
            `invalid DESCRIBE/CLOSE message subtype "${kind}"`,
        );
    }
    return kind;
};

const readFormatCodes = (reader: PayloadReader, subject: string): number[] =>
    readTimes(readCount(reader), () => {
        const code = reader.int16();
        if (code !== TEXT_FORMAT && code !== BINARY_FORMAT) {
            throw protocolViolation(
                `unsupported ${subject} format code ${code}`,
            );
        }
        return code;
    });

export const readParseMessage = (payload: Buffer): ParseMessage => {
    const reader = new PayloadReader(payload);
    const statementName = reader.cstring();
    const sql = reader.cstring();
    const parameterOids = readTimes(readCount(reader), () => reader.int32());
    return { statementName, sql, parameterOids };
};

/**
 * Format codes come as 0 entries (all text), 1 entry (applies to every
 * value) or one entry per value; expand to one entry per value.
 */
export const expandFormats = (
    formats: number[],
    count: number,
    subject: 'parameter' | 'result column',
): number[] => {
    if (formats.length === 0) {
        return Array.from({ length: count }, () => TEXT_FORMAT);
    }
    if (formats.length === 1) {
        return Array.from({ length: count }, () => formats[0]);
    }
    if (formats.length !== count) {
        throw protocolViolation(
            `bind message has ${formats.length} ${subject} formats but ${count} ${subject}s`,
        );
    }
    return formats;
};

export const readBindMessage = (payload: Buffer): BindMessage => {
    const reader = new PayloadReader(payload);
    const portalName = reader.cstring();
    const statementName = reader.cstring();
    const rawParameterFormats = readFormatCodes(reader, 'parameter');
    const parameters = readTimes(readCount(reader), () => {
        const length = reader.int32();
        if (length === -1) {
            return null;
        }
        if (length < 0) {
            throw protocolViolation(`invalid parameter length ${length}`);
        }
        return Buffer.from(reader.bytes(length));
    });
    const resultFormats = readFormatCodes(reader, 'result column');
    return {
        portalName,
        statementName,
        parameterFormats: expandFormats(
            rawParameterFormats,
            parameters.length,
            'parameter',
        ),
        parameters,
        resultFormats,
    };
};

export const readDescribeMessage = (payload: Buffer): DescribeMessage => {
    const reader = new PayloadReader(payload);
    const kind = readKind(reader);
    return { kind, name: reader.cstring() };
};

export const readCloseMessage = (payload: Buffer): CloseMessage => {
    const reader = new PayloadReader(payload);
    const kind = readKind(reader);
    return { kind, name: reader.cstring() };
};

export const readExecuteMessage = (payload: Buffer): ExecuteMessage => {
    const reader = new PayloadReader(payload);
    const portalName = reader.cstring();
    return { portalName, maxRows: reader.int32() };
};

export const isTextFormat = (format: number): boolean => format === TEXT_FORMAT;

const NUMERIC_LITERAL = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

/** Render one bound text-format parameter as a SQL literal */
const toSqlLiteral = (value: string | null, oid: number): string => {
    if (value === null) {
        return 'NULL';
    }
    if (oid === PG_OID.bool) {
        const spelling = value.trim().toLowerCase();
        if (TRUE_LITERALS.has(spelling)) {
            return 'TRUE';
        }
        if (FALSE_LITERALS.has(spelling)) {
            return 'FALSE';
        }
        throw new PgWireServerError(
            `invalid input syntax for type boolean: "${value}"`,
            '22P02',
        );
    }
    if (NUMERIC_OIDS.has(oid) && NUMERIC_LITERAL.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, "''")}'`;
};

/**
 * Values that stand in for unbound parameters when a statement is described
 * before it is bound: the result columns don't depend on them, they only
 * have to compile.
 */
export const placeholderValues = (parameterOids: number[]): string[] =>
    parameterOids.map((oid) => {
        if (oid === PG_OID.bool) {
            return 'true';
        }
        if (NUMERIC_OIDS.has(oid)) {
            return '1';
        }
        return '';
    });

type ScanState =
    | 'sql'
    | 'string'
    | 'identifier'
    | 'lineComment'
    | 'blockComment';

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

/** `$` starts a placeholder only when it is not glued to an identifier (`foo$1`) */
const placeholderAt = (sql: string, position: number): string | null => {
    if (sql[position] !== '$') {
        return null;
    }
    const previous = sql[position - 1];
    if (previous !== undefined && IDENTIFIER_CHAR.test(previous)) {
        return null;
    }
    const digits = /^\d+/.exec(sql.slice(position + 1));
    return digits ? digits[0] : null;
};

/** Length of the token at `position` and the state after it; the tricky cases are two-character delimiters */
const scanStep = (
    sql: string,
    position: number,
    state: ScanState,
): { length: number; state: ScanState } => {
    const char = sql[position];
    const pair = sql.slice(position, position + 2);
    switch (state) {
        case 'sql':
            if (char === "'") {
                return { length: 1, state: 'string' };
            }
            if (char === '"') {
                return { length: 1, state: 'identifier' };
            }
            if (pair === '--') {
                return { length: 2, state: 'lineComment' };
            }
            if (pair === '/*') {
                return { length: 2, state: 'blockComment' };
            }
            return { length: 1, state };
        case 'string':
            // '' inside a string is an escaped quote, not the end
            if (pair === "''") {
                return { length: 2, state };
            }
            return { length: 1, state: char === "'" ? 'sql' : state };
        case 'identifier':
            return { length: 1, state: char === '"' ? 'sql' : state };
        case 'lineComment':
            return { length: 1, state: char === '\n' ? 'sql' : state };
        case 'blockComment':
            if (pair === '*/') {
                return { length: 2, state: 'sql' };
            }
            return { length: 1, state };
        default:
            return assertUnreachable(state, `unknown scan state ${state}`);
    }
};

/**
 * Rewrite every `$n` placeholder outside quoted strings, quoted identifiers
 * and comments with `replacement(n)`. Copies the SQL in slices between
 * placeholders and refuses to grow past MAX_INLINED_SQL_LENGTH.
 */
const replacePlaceholders = (
    sql: string,
    replacement: (index: number) => string,
): string => {
    const parts: string[] = [];
    let outputLength = 0;
    let state: ScanState = 'sql';
    let position = 0;
    let sliceStart = 0;
    const push = (text: string): void => {
        outputLength += text.length;
        if (outputLength > MAX_INLINED_SQL_LENGTH) {
            throw new PgWireServerError(
                'statement is too large after parameter substitution',
                '54000',
            );
        }
        parts.push(text);
    };
    while (position < sql.length) {
        const digits = state === 'sql' ? placeholderAt(sql, position) : null;
        if (digits !== null) {
            push(sql.slice(sliceStart, position));
            push(replacement(Number(digits)));
            position += 1 + digits.length;
            sliceStart = position;
        } else {
            const step = scanStep(sql, position, state);
            position += step.length;
            state = step.state;
        }
    }
    push(sql.slice(sliceStart));
    return parts.join('');
};

const checkParameterIndex = (index: number): void => {
    if (index > MAX_PARAMETERS) {
        throw new PgWireServerError(
            `cannot have more than ${MAX_PARAMETERS} parameters in a statement`,
            '54023',
        );
    }
};

/**
 * Number of parameters a statement takes: the highest `$n` it references.
 * Clients may declare fewer (or no) parameter types in Parse than the SQL
 * uses, exactly as with Postgres, which then infers the rest.
 */
export const countParameters = (sql: string): number => {
    let highest = 0;
    replacePlaceholders(sql, (index) => {
        checkParameterIndex(index);
        highest = Math.max(highest, index);
        return `$${index}`;
    });
    return highest;
};

/**
 * Replace `$n` placeholders with literals. The result is compiled to a metric
 * query and never reaches a warehouse as-is, so literal inlining is safe here.
 */
export const inlineParameters = (
    sql: string,
    values: (string | null)[],
    parameterOids: number[],
): string =>
    replacePlaceholders(sql, (index) => {
        checkParameterIndex(index);
        if (index < 1 || index > values.length) {
            throw new PgWireServerError(
                `there is no parameter $${index}`,
                '42P02',
            );
        }
        return toSqlLiteral(values[index - 1], parameterOids[index - 1] ?? 0);
    });
