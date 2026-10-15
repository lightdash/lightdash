import {
    CUSTOM_HEADER_LIMITS,
    FORBIDDEN_CUSTOM_HEADER_NAMES,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

const tHeaders = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`externalConnections.customHeaders.errors.${key}`, {
        ns: 'sync',
        ...options,
    });

/** One editable row in the custom headers form field. */
export type CustomHeaderRow = { name: string; value: string };

// Mirrors the backend's custom-header validators (proxyValidation.ts) so bad
// headers are caught inline before submit.
const HTTP_HEADER_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
// eslint-disable-next-line no-control-regex
const HTTP_HEADER_VALUE = /^[\t\x20-\x7e]+$/;
const FORBIDDEN_NAMES = new Set<string>(FORBIDDEN_CUSTOM_HEADER_NAMES);

export const recordToCustomHeaderRows = (
    headers: Record<string, string> | null | undefined,
): CustomHeaderRow[] =>
    Object.entries(headers ?? {}).map(([name, value]) => ({ name, value }));

/** Fully blank rows are dropped; returns null when nothing remains. */
export const customHeaderRowsToRecord = (
    rows: CustomHeaderRow[],
): Record<string, string> | null => {
    const entries = rows
        .map((row) => [row.name.trim(), row.value.trim()] as const)
        .filter(([name, value]) => name.length > 0 && value.length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : null;
};

/** Returns a user-facing error for the first invalid row, or null. */
export const validateCustomHeaderRows = (
    rows: CustomHeaderRow[],
): string | null => {
    const seen = new Set<string>();
    for (const row of rows) {
        const name = row.name.trim();
        const value = row.value.trim();
        // A fully blank row is dropped on submit.
        if (!name && !value) continue;
        if (
            !name ||
            !HTTP_HEADER_TOKEN.test(name) ||
            name.length > CUSTOM_HEADER_LIMITS.maxNameChars
        ) {
            return tHeaders('invalidName', { name: row.name });
        }
        if (FORBIDDEN_NAMES.has(name.toLowerCase())) {
            return tHeaders('reserved', { name });
        }
        if (!value) {
            return tHeaders('missingValue', { name });
        }
        if (value.length > CUSTOM_HEADER_LIMITS.maxValueChars) {
            return tHeaders('valueTooLong', {
                name,
                max: CUSTOM_HEADER_LIMITS.maxValueChars,
            });
        }
        if (!HTTP_HEADER_VALUE.test(value)) {
            return tHeaders('unsupportedCharacters', { name });
        }
        const lower = name.toLowerCase();
        if (seen.has(lower)) {
            return tHeaders('duplicate', { name });
        }
        seen.add(lower);
    }
    if (seen.size > CUSTOM_HEADER_LIMITS.maxCount) {
        return tHeaders('tooMany', { max: CUSTOM_HEADER_LIMITS.maxCount });
    }
    return null;
};
