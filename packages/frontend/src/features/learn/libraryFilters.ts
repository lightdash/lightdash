import { GROUP_ORDER, type LearnGroup } from './catalogue';

/**
 * The library's filters live in its address, so a walkthrough that leaves
 * the library can bring the learner back to it as they left it: Extra
 * modules still on, the same tab, the same search. Defaults are left out,
 * so the plain library address is the default view.
 */
export type LibraryFilters = {
    query: string;
    showExtra: boolean;
    showSoon: boolean;
    group: LearnGroup | null;
};

const isLearnGroup = (value: string | null): value is LearnGroup =>
    GROUP_ORDER.some((group) => group === value);

export const readLibraryFilters = (params: URLSearchParams): LibraryFilters => {
    const group = params.get('group');
    return {
        query: params.get('q') ?? '',
        showExtra: params.get('extra') === '1',
        showSoon: params.get('soon') !== '0',
        group: isLearnGroup(group) ? group : null,
    };
};

export const writeLibraryFilters = (
    params: URLSearchParams,
    patch: Partial<LibraryFilters>,
): URLSearchParams => {
    const next = new URLSearchParams(params);
    const setOrDelete = (key: string, value: string | null) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
    };
    if (patch.showExtra !== undefined)
        setOrDelete('extra', patch.showExtra ? '1' : null);
    if (patch.showSoon !== undefined)
        setOrDelete('soon', patch.showSoon ? null : '0');
    if (patch.group !== undefined) setOrDelete('group', patch.group);
    if (patch.query !== undefined) setOrDelete('q', patch.query || null);
    return next;
};

/**
 * The library's filters as the learner last left them, kept per tab like
 * the origin project (see origin.ts), for the walkthrough's way back.
 */
const SEARCH_KEY = 'lightdash.learn.librarySearch';

export const rememberLibrarySearch = (search: string) => {
    try {
        if (search) sessionStorage.setItem(SEARCH_KEY, search);
        else sessionStorage.removeItem(SEARCH_KEY);
    } catch {
        // Storage unavailable (private mode, quota): the learner returns to
        // the library's default view, as before.
    }
};

const readLibrarySearch = (): string => {
    try {
        return sessionStorage.getItem(SEARCH_KEY) ?? '';
    } catch {
        return '';
    }
};

/** A project's library, with the filters the learner last left it on. */
export const libraryPath = (projectUuid: string) =>
    `/projects/${projectUuid}/learn${readLibrarySearch()}`;
