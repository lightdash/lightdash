import { PgWireServerError } from '../PgWireServerError';

/**
 * Resource limits for catalog statements. Any authenticated client can send
 * arbitrary SQL to the evaluator, which runs on the API's event loop, so every
 * dimension a statement can grow in is bounded: tuples, work, time, value
 * size and result size. Real driver metadata queries stay far below all of
 * them.
 */
export const MAX_INTERMEDIATE_TUPLES = 100_000;
/** Work units: roughly one per row per pass, plus bytes/64 for every string built or keyed */
export const MAX_WORK_UNITS = 10_000_000;
export const MAX_STATEMENT_MS = 2_000;
export const MAX_VALUE_LENGTH = 64 * 1024;
export const MAX_RESULT_LENGTH = 16 * 1024 * 1024;
export const MAX_PATTERN_LENGTH = 1_000;
export const MAX_PATTERN_SUBJECT_LENGTH = 10_000;

/** Work units a string of `length` characters costs to build, copy or key (bytes are the scarce resource) */
export const unitsForLength = (length: number): number => 1 + length / 8;

export const tooExpensive = (what: string): PgWireServerError =>
    new PgWireServerError(
        `catalog query ${what}; add conditions that relate the tables or select less`,
        '54000',
    );

/** Strings built by the evaluator may not outgrow MAX_VALUE_LENGTH */
export const assertValueLength = (value: string): string => {
    if (value.length > MAX_VALUE_LENGTH) {
        throw tooExpensive('builds a value that is too large');
    }
    return value;
};
