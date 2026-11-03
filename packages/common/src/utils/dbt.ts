const DBT_SELECTOR_TERM = /^@?[a-zA-Z0-9*\-.+:_/]+$/;

export const validateDbtSelector = (selector: string): boolean => {
    const trimmed = selector.trim();
    if (!trimmed || /(^|,)\s*,|,\s*$/.test(trimmed)) return false;
    return trimmed
        .split(/[\s,]+/)
        .every((term) => DBT_SELECTOR_TERM.test(term));
};
