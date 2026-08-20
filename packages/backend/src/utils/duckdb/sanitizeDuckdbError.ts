import { getErrorMessage } from '@lightdash/common';

const STORAGE_URI_PATTERNS = [
    /s3:\/\/.+?(?=:\s|[\s'"),;]|$)/gi,
    /https?:\/\/\S*?\/external-sources\/.+?(?=:\s|[\s'"),;]|$)/gi,
];

export const sanitizeDuckdbError = (error: unknown): string =>
    STORAGE_URI_PATTERNS.reduce(
        (message, pattern) =>
            message.replace(pattern, '[external source data]'),
        getErrorMessage(error),
    );
