import { validate as isUuid } from 'uuid';
import { ParameterError } from '../types/errors';

// Every code point Unicode marks Default_Ignorable: the ones that render as nothing or only reorder or
// join text (zero-width and bidi controls, soft hyphen, grapheme joiner, variation selectors, tags,
// Hangul and Khmer fillers, Mongolian and musical format controls). NFKC never produces one, so
// removing them first keeps the result idempotent and nothing can sit beside a look-alike name
const INVISIBLE_CHARACTERS = /\p{Default_Ignorable_Code_Point}/gu;
const MESSAGE_ECHO_LENGTH = 80;

// The most entries a list of groups, members or owners may hold
export const MAX_DEPARTMENT_LIST_LENGTH = 5000;
// The overlap diagram shows at most three sets, so with and without each list at most two departments
export const MAX_OVERLAP_DEPARTMENTS = 2;

// The form a department name is compared and stored in: invisible characters removed before NFKC, so an
// accent they separated still composes, then trimmed, and every run of whitespace inside it as one space
export const normalizeDepartmentName = (name: string): string =>
    name
        .replace(INVISIBLE_CHARACTERS, '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');

// C0 controls (U+0000 to U+001F), DEL and C1 controls (U+0080 to U+009F); Postgres refuses NUL in text outright
export const hasControlCharacter = (value: string): boolean => {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    }
    return false;
};

// Input repeated back in an error message is cut short, whatever its size
export const truncateForMessage = (value: unknown): string => {
    const text = String(value);
    return text.length > MESSAGE_ECHO_LENGTH
        ? `${text.slice(0, MESSAGE_ECHO_LENGTH)}…`
        : text;
};

// Lower case, so a uuid matches the same everywhere: Postgres compares uuids in any case, JavaScript does not
export const parseUuid = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !isUuid(value)) {
        throw new ParameterError(
            `${label} must be a valid UUID: ${truncateForMessage(value)}`,
        );
    }
    return value.toLowerCase();
};

export const parseUuids = (values: unknown, label: string): string[] => {
    if (!Array.isArray(values)) {
        throw new ParameterError(`${label} must be a list`);
    }
    if (values.length > MAX_DEPARTMENT_LIST_LENGTH) {
        throw new ParameterError(
            `${label} can hold at most ${MAX_DEPARTMENT_LIST_LENGTH} entries`,
        );
    }
    return values.map((v: unknown) => parseUuid(v, label));
};

// A with or without list for overlaps; an empty list is the same as leaving it out
export const parseOverlapList = (
    listName: 'with' | 'without',
    values: string[] | undefined,
    departmentUuid: string,
): string[] | null => {
    if (values === undefined) return null;
    const uuids = parseUuids(values, 'Department');
    if (uuids.length > MAX_OVERLAP_DEPARTMENTS) {
        throw new ParameterError(
            `"${listName}" can list at most ${MAX_OVERLAP_DEPARTMENTS} departments`,
        );
    }
    if (uuids.includes(departmentUuid)) {
        throw new ParameterError(
            `"${listName}" cannot list the department itself`,
        );
    }
    return uuids.length === 0 ? null : Array.from(new Set(uuids));
};
