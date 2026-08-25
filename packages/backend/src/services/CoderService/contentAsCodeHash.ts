import { createHash } from 'crypto';

const CONTENT_AS_CODE_TIMESTAMP_KEYS = new Set(['downloadedAt', 'updatedAt']);

const CONTENT_AS_CODE_HASH_PATTERN = /^[a-f0-9]{64}$/;

export const isContentAsCodeContentHash = (value: string): boolean =>
    CONTENT_AS_CODE_HASH_PATTERN.test(value);

const toCanonicalValue = (value: unknown): unknown => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => toCanonicalValue(item));
    }

    const record = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const fieldName of Object.keys(record)
        .filter(
            (candidate) =>
                !CONTENT_AS_CODE_TIMESTAMP_KEYS.has(candidate) &&
                record[candidate] !== undefined,
        )
        .sort()) {
        canonical[fieldName] = toCanonicalValue(record[fieldName]);
    }
    return canonical;
};

export const toCanonicalContentAsCodeSnapshot = (
    document: unknown,
): Record<string, unknown> => {
    const canonical = toCanonicalValue(document);
    if (
        canonical === null ||
        typeof canonical !== 'object' ||
        Array.isArray(canonical)
    ) {
        throw new Error('Content-as-code snapshot must be an object');
    }
    return canonical as Record<string, unknown>;
};

export const stableStringifyContentAsCode = (value: unknown): string =>
    JSON.stringify(toCanonicalValue(value));

export const hashContentAsCodeDocument = (document: unknown): string =>
    createHash('sha256')
        .update(stableStringifyContentAsCode(document))
        .digest('hex');
