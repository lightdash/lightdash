import { getErrorMessage } from '@lightdash/common';

const STORAGE_URI_PATTERNS = [
    /s3:\/\/[^\s'"`]+/giu,
    /https?:\/\/[^\s'"`]*\/external-sources\/[^\s'"`]+/giu,
];
const TRAILING_PUNCTUATION = /[\])}>,;:.!?]+$/u;

const redactStorageUri = (uri: string): string => {
    const punctuation = uri.match(TRAILING_PUNCTUATION)?.[0] ?? '';
    return `[external source data]${punctuation}`;
};

export const sanitizeDuckdbError = (error: unknown): string =>
    STORAGE_URI_PATTERNS.reduce(
        (message, pattern) => message.replace(pattern, redactStorageUri),
        getErrorMessage(error),
    );
