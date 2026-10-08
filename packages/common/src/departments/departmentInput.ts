// Characters that render as nothing or only reorder text, combining ones first so none reads as joined to a letter:
// grapheme joiner, variation selectors, soft hyphen, zero-width and bidi controls, and tags
const INVISIBLE_CHARACTERS =
    /[\u034F\uFE00-\uFE0F\u00AD\u200B-\u200F\u2060\uFEFF\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu;
const MESSAGE_ECHO_LENGTH = 80;

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
