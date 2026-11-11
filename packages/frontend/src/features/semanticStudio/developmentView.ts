import { useLocalStorage } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const STORAGE_KEY = 'lightdash-development-view';
const PREVIEW_STORAGE_KEY = 'lightdash-development-preview';

/** Asks the server to apply this person's unpublished model changes to what a request reads. */
export const DEVELOPMENT_VIEW_HEADER = 'Lightdash-Development-View';
/** Names the preview project to read instead, for a project whose unpublished changes live on a branch. */
export const DEVELOPMENT_PREVIEW_HEADER = 'Lightdash-Development-Preview';

/** The headers that put a request in the development view; none when it is off. Read outside React by the API client. */
export const getDevelopmentViewHeaders = (): Record<string, string> => {
    try {
        if (localStorage.getItem(STORAGE_KEY) !== 'true') return {};
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
 * The development view and its switch; switching refetches everything, since any
 * query may read a changed model. A project whose changes live on a branch
 * names the preview project built from it.
 */
export const useDevelopmentView = (): [
    boolean,
    (next: boolean, previewProjectUuid?: string | null) => void,
] => {
    const [isOn, setIsOn] = useLocalStorage({
        key: STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const queryClient = useQueryClient();
    const set = useCallback(
        (next: boolean, previewProjectUuid: string | null = null) => {
            try {
                if (next && previewProjectUuid) {
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
            setIsOn(next);
            void queryClient.invalidateQueries();
        },
        [queryClient, setIsOn],
    );
    return [isOn, set];
};
