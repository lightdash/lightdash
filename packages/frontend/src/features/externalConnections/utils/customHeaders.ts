import {
    CUSTOM_HEADER_LIMITS,
    FORBIDDEN_CUSTOM_HEADER_NAMES,
} from '@lightdash/common';

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
            return `"${row.name}" is not a valid header name`;
        }
        if (FORBIDDEN_NAMES.has(name.toLowerCase())) {
            return `Header "${name}" is not allowed — use the connection's authentication for credentials`;
        }
        if (!value) {
            return `Header "${name}" needs a value`;
        }
        if (value.length > CUSTOM_HEADER_LIMITS.maxValueChars) {
            return `The value of "${name}" is too long (max ${CUSTOM_HEADER_LIMITS.maxValueChars} characters)`;
        }
        if (!HTTP_HEADER_VALUE.test(value)) {
            return `The value of "${name}" contains unsupported characters`;
        }
        const lower = name.toLowerCase();
        if (seen.has(lower)) {
            return `Duplicate header "${name}"`;
        }
        seen.add(lower);
    }
    if (seen.size > CUSTOM_HEADER_LIMITS.maxCount) {
        return `At most ${CUSTOM_HEADER_LIMITS.maxCount} custom headers are allowed`;
    }
    return null;
};
