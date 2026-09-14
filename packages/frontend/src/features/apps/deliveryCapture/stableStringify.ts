import isPlainObject from 'lodash/isPlainObject';

/** Deterministic JSON stringify: object keys sorted recursively so
 *  field-order-permuted payloads hash identically. Mirrors JSON.stringify's
 *  handling of `undefined` (dropped from objects, nulled in arrays). */
export const stableStringify = (value: unknown): string => {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
};

/** Fields the delivery-capture hash must ignore: they vary per render
 *  context/attribution rather than identifying a distinct query. */
const STRIPPED_TOP_LEVEL_BODY_FIELDS = [
    'invalidateCache',
    'context',
    'dashboardFilters',
] as const;

/** Strips top-level capture-irrelevant fields from a query POST body before
 *  it feeds the captureKey hash. Non-object bodies pass through unchanged. */
export const stripCaptureBodyFields = (body: unknown): unknown => {
    if (!isPlainObject(body)) return body;
    const rest = { ...(body as Record<string, unknown>) };
    STRIPPED_TOP_LEVEL_BODY_FIELDS.forEach((field) => {
        delete rest[field];
    });
    return rest;
};
