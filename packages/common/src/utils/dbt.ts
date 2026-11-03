import { merge, mergeWith } from 'es-toolkit';

const DBT_SELECTOR_TERM = /^@?[a-zA-Z0-9*\-.+:_/]+$/;

export const validateDbtSelector = (selector: string): boolean => {
    const trimmed = selector.trim();
    if (!trimmed || /(^|,)\s*,|,\s*$/.test(trimmed)) return false;
    return trimmed
        .split(/[\s,]+/)
        .every((term) => DBT_SELECTOR_TERM.test(term));
};

// Matches lodash merge: an array replaces a non-array value instead of being merged into it.
const replaceWithArray = (target: unknown, source: unknown) =>
    Array.isArray(source) && !Array.isArray(target)
        ? merge([], source)
        : undefined;

/** Deep-merges dbt `meta` sources left to right, later sources winning. */
export const mergeDbtMeta = <T extends object>(
    ...sources: Array<T | undefined>
): T =>
    sources.reduce<T>(
        (merged, source) => mergeWith(merged, source ?? {}, replaceWithArray),
        {} as T,
    );
