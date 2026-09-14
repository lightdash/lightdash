import { PG_OID, TRUE_LITERALS } from './pgTypes';
import { PgWireServerError } from './PgWireServerError';
import { float64, int16, int32, int64 } from './wireEncoding';

/**
 * Binary wire encodings for the handful of Postgres types this server emits
 * (TYPE_OIDS in lightdashHandlers) and accepts as bound parameters. Drivers
 * ask for binary once they know a column's type: pgjdbc after
 * `prepareThreshold`, psycopg3 for ints by default.
 *
 * Reference: src/backend/utils/adt/*send/*recv in the Postgres sources.
 */

const TEXT_LIKE_OIDS = new Set<number>([
    PG_OID.name,
    PG_OID.text,
    PG_OID.bpchar,
    PG_OID.varchar,
]);

const FIXED_BINARY_LENGTHS: Record<number, number> = {
    [PG_OID.bool]: 1,
    [PG_OID.int2]: 2,
    [PG_OID.int4]: 4,
    [PG_OID.int8]: 8,
    [PG_OID.float4]: 4,
    [PG_OID.float8]: 8,
    [PG_OID.date]: 4,
    [PG_OID.timestamp]: 8,
};

const POSTGRES_EPOCH_MS = Date.UTC(2000, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MICROS_PER_MS = 1000n;
const INT4_MIN = -(2 ** 31);
const INT4_MAX = 2 ** 31 - 1;
const INT8_MIN = -(2n ** 63n);
const INT8_MAX = 2n ** 63n - 1n;

const unsupported = (verb: 'decode' | 'encode', oid: number) =>
    new PgWireServerError(
        `cannot ${verb} type with OID ${oid} in binary format`,
        '0A000',
        'Use text format for this type',
    );

const invalidText = (text: string, oid: number) =>
    new PgWireServerError(
        `cannot encode "${text}" as binary type with OID ${oid}`,
        '22P03',
    );

const outOfRange = (text: string, oid: number) =>
    new PgWireServerError(
        `value "${text}" is out of range for type with OID ${oid}`,
        '22003',
    );

const pad = (n: number, width: number): string =>
    String(n).padStart(width, '0');

const outOfDateRange = () =>
    new PgWireServerError('date/time field value out of range', '22008');

/** days since 2000-01-01 -> 'YYYY-MM-DD' */
const decodeDate = (days: number): string => {
    const date = new Date(POSTGRES_EPOCH_MS + days * MS_PER_DAY);
    if (Number.isNaN(date.getTime())) {
        throw outOfDateRange();
    }
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
};

/** BigInt division rounding towards -Infinity, so the remainder is never negative */
const floorDiv = (n: bigint, d: bigint): bigint =>
    n >= 0n ? n / d : -((-n + d - 1n) / d);

/** microseconds since 2000-01-01 -> 'YYYY-MM-DD HH:MM:SS.ffffff' */
const decodeTimestamp = (micros: bigint): string => {
    const wholeMs = floorDiv(micros, MICROS_PER_MS);
    const remainderMicros = micros - wholeMs * MICROS_PER_MS;
    const date = new Date(POSTGRES_EPOCH_MS + Number(wholeMs));
    if (Number.isNaN(date.getTime())) {
        throw outOfDateRange();
    }
    const fraction = pad(
        date.getUTCMilliseconds() * 1000 + Number(remainderMicros),
        6,
    );
    return `${decodeDate(Math.floor((date.getTime() - POSTGRES_EPOCH_MS) / MS_PER_DAY))} ${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:${pad(date.getUTCSeconds(), 2)}.${fraction}`;
};

/** Binary parameter bytes -> the text form the compiler expects */
export const decodeBinaryParameter = (bytes: Buffer, oid: number): string => {
    if (TEXT_LIKE_OIDS.has(oid)) {
        return bytes.toString('utf8');
    }
    const expectedLength = FIXED_BINARY_LENGTHS[oid];
    if (expectedLength === undefined) {
        throw unsupported('decode', oid);
    }
    if (bytes.length !== expectedLength) {
        throw new PgWireServerError(
            `incorrect binary data format in bind parameter: expected ${expectedLength} bytes for type OID ${oid}, got ${bytes.length}`,
            '22P03',
        );
    }
    switch (oid) {
        case PG_OID.bool:
            return bytes[0] !== 0 ? 't' : 'f';
        case PG_OID.int2:
            return String(bytes.readInt16BE(0));
        case PG_OID.int4:
            return String(bytes.readInt32BE(0));
        case PG_OID.int8:
            return bytes.readBigInt64BE(0).toString();
        case PG_OID.float4:
            return String(bytes.readFloatBE(0));
        case PG_OID.float8:
            return String(bytes.readDoubleBE(0));
        case PG_OID.date:
            return decodeDate(bytes.readInt32BE(0));
        default:
            return decodeTimestamp(bytes.readBigInt64BE(0));
    }
};

const parseInteger = (text: string, oid: number): bigint => {
    if (text.trim().length === 0) {
        throw invalidText(text, oid);
    }
    try {
        return BigInt(text);
    } catch {
        const asNumber = Number(text);
        if (!Number.isFinite(asNumber)) {
            throw invalidText(text, oid);
        }
        return BigInt(Math.trunc(asNumber));
    }
};

const parseFloat64 = (text: string, oid: number): number => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        throw invalidText(text, oid);
    }
    const value = Number(trimmed);
    if (Number.isNaN(value) && trimmed.toLowerCase() !== 'nan') {
        throw invalidText(text, oid);
    }
    return value;
};

/** 'YYYY-MM-DD' -> days since 2000-01-01 */
const encodeDate = (text: string): Buffer => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) {
        throw invalidText(text, PG_OID.date);
    }
    const [, year, month, day] = match.map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day); // Date.UTC maps years < 100 to 19xx
    return int32((date.getTime() - POSTGRES_EPOCH_MS) / MS_PER_DAY);
};

/** 'YYYY-MM-DD HH:MM:SS[.ffffff][+00]' (always UTC here) -> microseconds since 2000-01-01 */
const encodeTimestamp = (text: string): Buffer => {
    const match =
        /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]00(?::?00)?)?$/.exec(
            text,
        );
    if (!match) {
        throw invalidText(text, PG_OID.timestamp);
    }
    const [, date, time, fraction = ''] = match;
    const wholeSecondsMs = Date.parse(`${date}T${time}Z`);
    if (Number.isNaN(wholeSecondsMs)) {
        throw invalidText(text, PG_OID.timestamp);
    }
    const micros = Number(fraction.padEnd(6, '0').slice(0, 6));
    return int64(
        BigInt(wholeSecondsMs - POSTGRES_EPOCH_MS) * MICROS_PER_MS +
            BigInt(micros),
    );
};

/** Text-format value (as produced by the handlers) -> binary bytes for `oid` */
export const encodeBinaryValue = (text: string, oid: number): Buffer => {
    if (TEXT_LIKE_OIDS.has(oid)) {
        return Buffer.from(text, 'utf8');
    }
    switch (oid) {
        case PG_OID.bool:
            return Buffer.from([
                TRUE_LITERALS.has(text.trim().toLowerCase()) ? 1 : 0,
            ]);
        case PG_OID.int4: {
            const value = parseInteger(text, oid);
            if (value < BigInt(INT4_MIN) || value > BigInt(INT4_MAX)) {
                throw outOfRange(text, oid);
            }
            return int32(Number(value));
        }
        case PG_OID.int8: {
            const value = parseInteger(text, oid);
            if (value < INT8_MIN || value > INT8_MAX) {
                throw outOfRange(text, oid);
            }
            return int64(value);
        }
        case PG_OID.float8:
            return float64(parseFloat64(text, oid));
        case PG_OID.float4: {
            const b = Buffer.alloc(4);
            b.writeFloatBE(parseFloat64(text, oid));
            return b;
        }
        case PG_OID.int2: {
            const value = parseInteger(text, oid);
            if (value < -32768n || value > 32767n) {
                throw outOfRange(text, oid);
            }
            return int16(Number(value));
        }
        case PG_OID.oid:
        case PG_OID.regclass:
        case PG_OID.regproc:
        case PG_OID.regtype: {
            const value = parseInteger(text, oid);
            if (value < 0n || value > 4294967295n) {
                throw outOfRange(text, oid);
            }
            const b = Buffer.alloc(4);
            b.writeUInt32BE(Number(value));
            return b;
        }
        case PG_OID.char:
            return Buffer.from(text.slice(0, 1), 'utf8');
        case PG_OID.date:
            return encodeDate(text);
        case PG_OID.timestamp:
            return encodeTimestamp(text);
        default:
            throw unsupported('encode', oid);
    }
};
