import { useLocalStorage } from '@mantine/hooks';
import {
    hashQueryKey,
    useQueryClient,
    type QueryClient,
    type QueryKey,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';

const STORAGE_KEY = 'lightdash-development-view-project';
const PREVIEW_STORAGE_KEY = 'lightdash-development-preview';
/** The project the person has a draft checked out on, so the whole app reads it from the first request. */
const CHECKOUT_STORAGE_KEY = 'lightdash-checked-out-project';

/** Asks the server to apply this person's unpublished model changes to what a request reads. */
export const DEVELOPMENT_VIEW_HEADER = 'Lightdash-Development-View';
/** Names the preview project to read instead, for a project whose unpublished changes live on a branch. */
export const DEVELOPMENT_PREVIEW_HEADER = 'Lightdash-Development-Preview';

// Queries that read the repository or name their own view, so switching the view cannot change them.
const SAME_IN_EITHER_VIEW = new Set([
    'pullRequestCiChecks',
    'pullRequestDiff',
    'aiWritebackRunStatus',
    'semantic-studio-sources',
    'semantic-studio-workspaces',
    'semantic-studio-model-version',
    'semantic-studio-checkout',
]);

const PROJECT_IN_PATH = /\/projects\/([^/]+)/;

const findProjectInPath = (pathname: string): string | null =>
    PROJECT_IN_PATH.exec(pathname)?.[1] ?? null;

/** The view belongs to the project it was switched on in, by slug or uuid, and is off on every other page. */
const isOnFor = (project: string | null, pathname: string): boolean => {
    const here = findProjectInPath(pathname);
    return (
        project !== null && here !== null && project.split(' ').includes(here)
    );
};

/** Switches the view off; for when the signed-in person changes. */
export const clearDevelopmentView = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PREVIEW_STORAGE_KEY);
        localStorage.removeItem(CHECKOUT_STORAGE_KEY);
    } catch {
        // Nothing stored without storage.
    }
};

/** The preview project the view reads, or null when it reads the person's latest change directly. */
export const getDevelopmentPreview = (): string | null => {
    try {
        return localStorage.getItem(PREVIEW_STORAGE_KEY);
    } catch {
        return null;
    }
};

/** The headers that put a request in the development view; none when it is off. Read outside React by the API client. */
export const getDevelopmentViewHeaders = (): Record<string, string> => {
    try {
        const { pathname } = window.location;
        if (isOnFor(localStorage.getItem(STORAGE_KEY), pathname)) {
            const preview = localStorage.getItem(PREVIEW_STORAGE_KEY);
            return {
                [DEVELOPMENT_VIEW_HEADER]: 'true',
                ...(preview ? { [DEVELOPMENT_PREVIEW_HEADER]: preview } : {}),
            };
        }
        return isOnFor(localStorage.getItem(CHECKOUT_STORAGE_KEY), pathname)
            ? { [DEVELOPMENT_VIEW_HEADER]: 'true' }
            : {};
    } catch {
        return {};
    }
};

/** Caches each view apart, since one key reads the draft on one page and what is published on another. */
export const hashQueryKeyByView = (queryKey: QueryKey): string => {
    const hash = hashQueryKey(queryKey);
    if (SAME_IN_EITHER_VIEW.has(String(queryKey[0]))) return hash;
    const headers = getDevelopmentViewHeaders();
    return Object.keys(headers).length > 0
        ? `${hash}${JSON.stringify(headers)}`
        : hash;
};

const readsTheView = (queryKey: QueryKey) =>
    !SAME_IN_EITHER_VIEW.has(String(queryKey[0]));

/** Switches the view and refetches what it reads, keeping each query's data meanwhile so no page drops back to its loader. */
const switchView = (queryClient: QueryClient, write: () => void) => {
    const shown = queryClient
        .getQueryCache()
        .getAll()
        .flatMap(({ queryKey, state }) =>
            readsTheView(queryKey) && state.data !== undefined
                ? [{ queryKey, data: state.data }]
                : [],
        );
    write();
    shown.forEach(({ queryKey, data }) => {
        if (queryClient.getQueryData(queryKey) === undefined) {
            queryClient.setQueryData(queryKey, data);
        }
    });
    void queryClient.invalidateQueries({
        predicate: ({ queryKey }) => readsTheView(queryKey),
    });
};

/** Open Try it sessions; each keeps the view it started on, so nothing moves it under them. */
let pins = 0;
export const pinDevelopmentView = (): (() => void) => {
    pins += 1;
    return () => {
        pins -= 1;
    };
};
export const isDevelopmentViewPinned = (): boolean => pins > 0;

const isCheckedOutHere = (pathname: string): boolean => {
    try {
        return isOnFor(localStorage.getItem(CHECKOUT_STORAGE_KEY), pathname);
    } catch {
        return false;
    }
};

const isDevelopmentViewOn = (): boolean =>
    Object.keys(getDevelopmentViewHeaders()).length > 0;

/**
 * The development view of the project in the address bar, and its switch;
 * switching refetches everything, since any query may read a changed model. A
 * project whose changes live on a branch names the preview project built from it.
 */
export const useDevelopmentView = (): [
    boolean,
    (next: boolean, previewProjectUuid?: string | null) => void,
] => {
    // Read at render and not from the router: this also runs where there is no router around it.
    const { pathname } = window.location;
    const [project, setProject] = useLocalStorage<string | null>({
        key: STORAGE_KEY,
        defaultValue: null,
        getInitialValueInEffect: false,
        // Stored bare, so the API client reads it without parsing.
        serialize: (value) => value ?? '',
        deserialize: (value) => value || null,
    });
    const queryClient = useQueryClient();
    const projectRoute = useOptionalProjectRoute();
    const set = useCallback(
        (next: boolean, previewProjectUuid: string | null = null) => {
            const here = findProjectInPath(pathname);
            const preview = next && here ? previewProjectUuid : null;
            const write = () => {
                try {
                    if (next && here && previewProjectUuid) {
                        localStorage.setItem(
                            PREVIEW_STORAGE_KEY,
                            previewProjectUuid,
                        );
                    } else {
                        localStorage.removeItem(PREVIEW_STORAGE_KEY);
                    }
                } catch {
                    // Without storage the view cannot be switched on at all.
                }
                setProject(
                    next && here
                        ? [
                              here,
                              projectRoute?.projectUuid,
                              projectRoute?.projectUrlIdentifier,
                          ].join(' ')
                        : null,
                );
            };
            // A checked-out draft already has every request reading it, so the switch is recorded and nothing is fetched again.
            const readsTheSame =
                ((next && !!here) || isCheckedOutHere(pathname)) ===
                    isDevelopmentViewOn() &&
                preview === getDevelopmentPreview();
            if (readsTheSame) write();
            else switchView(queryClient, write);
        },
        [pathname, queryClient, setProject, projectRoute],
    );
    return [isOnFor(project, pathname), set];
};

/** What the checked-out view last showed in this page: its change and compile. */
let shownCheckout: string | null = null;

/**
 * Keeps every request on a project's pages reading the person's checked-out
 * draft, given the project's identifiers and what it shows (null on what is
 * published); a change refetches everything, since any query may read a model.
 */
export const useCheckedOutView = () => {
    const queryClient = useQueryClient();
    return useCallback(
        (projectIdentifiers: string | null, shown: string | null) => {
            let stored: string | null;
            try {
                stored = localStorage.getItem(CHECKOUT_STORAGE_KEY);
            } catch {
                // Without storage the app reads what is published.
                return;
            }
            const write = () => {
                try {
                    if (projectIdentifiers === null) {
                        localStorage.removeItem(CHECKOUT_STORAGE_KEY);
                    } else {
                        localStorage.setItem(
                            CHECKOUT_STORAGE_KEY,
                            projectIdentifiers,
                        );
                    }
                } catch {
                    // Without storage the app reads what is published.
                }
            };
            const isFirst = shownCheckout === null;
            const changed =
                stored !== projectIdentifiers || shownCheckout !== shown;
            shownCheckout = shown;
            // A page that loaded with the right project stored already read the latest compile.
            if (!changed || (isFirst && stored === projectIdentifiers)) {
                write();
                return;
            }
            switchView(queryClient, write);
        },
        [queryClient],
    );
};
