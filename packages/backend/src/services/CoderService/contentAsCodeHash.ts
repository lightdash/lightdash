import { createHash } from 'crypto';

const CONTENT_AS_CODE_VOLATILE_KEYS = new Set([
    'downloadedAt',
    'updatedAt',
    'verification',
    'uuid',
]);

const CONTENT_AS_CODE_HASH_PATTERN = /^[a-f0-9]{64}$/;

export const isContentAsCodeContentHash = (value: string): boolean =>
    CONTENT_AS_CODE_HASH_PATTERN.test(value);

export const stableStringifyContentAsCode = (value: unknown): string => {
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value
            .map((item) => stableStringifyContentAsCode(item))
            .join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
        .filter(
            (key) =>
                !CONTENT_AS_CODE_VOLATILE_KEYS.has(key) &&
                record[key] !== undefined,
        )
        .sort();

    return `{${keys
        .map(
            (key) =>
                `${JSON.stringify(key)}:${stableStringifyContentAsCode(
                    record[key],
                )}`,
        )
        .join(',')}}`;
};

export const hashContentAsCodeDocument = (document: unknown): string =>
    createHash('sha256')
        .update(stableStringifyContentAsCode(document))
        .digest('hex');
