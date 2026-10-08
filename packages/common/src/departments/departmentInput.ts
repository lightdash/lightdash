// Characters that render as nothing, so two names that look the same could still differ
const ZERO_WIDTH_CHARACTERS = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;
const MESSAGE_ECHO_LENGTH = 80;

// The form a department name is compared and stored in: NFKC, no zero-width
// characters, trimmed, and every run of whitespace inside it as one space
export const normalizeDepartmentName = (name: string): string =>
    name
        .normalize('NFKC')
        .replace(ZERO_WIDTH_CHARACTERS, '')
        .trim()
        .replace(/\s+/g, ' ');

// C0 control characters (U+0000 to U+001F) and DEL; Postgres refuses NUL in text outright
export const hasControlCharacter = (value: string): boolean => {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code <= 0x1f || code === 0x7f) return true;
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
