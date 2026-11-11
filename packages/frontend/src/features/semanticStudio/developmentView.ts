import { useLocalStorage } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const STORAGE_KEY = 'lightdash-development-view-project';
const PREVIEW_STORAGE_KEY = 'lightdash-development-preview';

/** Asks the server to apply this person's unpublished model changes to what a request reads. */
export const DEVELOPMENT_VIEW_HEADER = 'Lightdash-Development-View';
/** Names the preview project to read instead, for a project whose unpublished changes live on a branch. */
export const DEVELOPMENT_PREVIEW_HEADER = 'Lightdash-Development-Preview';

const PROJECT_IN_PATH = /\/projects\/([^/]+)/;

const findProjectInPath = (pathname: string): string | null =>
    PROJECT_IN_PATH.exec(pathname)?.[1] ?? null;

/** The view belongs to the project it was switched on in, and is off on every other page. */
const isOnFor = (project: string | null, pathname: string): boolean =>
    project !== null && findProjectInPath(pathname) === project;

/** The headers that put a request in the development view; none when it is off. Read outside React by the API client. */
export const getDevelopmentViewHeaders = (): Record<string, string> => {
    try {
        const project = localStorage.getItem(STORAGE_KEY);
        if (!isOnFor(project, window.location.pathname)) return {};
        const preview = localStorage.getItem(PREVIEW_STORAGE_KEY);
        return {
            [DEVELOPMENT_VIEW_HEADER]: 'true',
            ...(preview ? { [DEVELOPMENT_PREVIEW_HEADER]: preview } : {}),
        };
    } catch {
        return {};
    }
};

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
    const set = useCallback(
        (next: boolean, previewProjectUuid: string | null = null) => {
            const here = findProjectInPath(pathname);
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
            setProject(next ? here : null);
            void queryClient.invalidateQueries();
        },
        [pathname, queryClient, setProject],
    );
    return [isOnFor(project, pathname), set];
};
