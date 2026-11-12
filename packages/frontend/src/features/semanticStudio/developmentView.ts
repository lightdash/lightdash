import { useLocalStorage } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

const STORAGE_KEY = 'lightdash-development-view';

/** Asks the server to apply this person's unpublished model changes to what a request reads. */
export const DEVELOPMENT_VIEW_HEADER = 'Lightdash-Development-View';

/** Whether requests should read this person's unpublished models; read outside React by the API client. */
export const isDevelopmentViewOn = (): boolean => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

/** The development view and its switch; switching refetches everything, since any query may read a changed model. */
export const useDevelopmentView = (): [boolean, (next: boolean) => void] => {
    const [isOn, setIsOn] = useLocalStorage({
        key: STORAGE_KEY,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const queryClient = useQueryClient();
    const set = useCallback(
        (next: boolean) => {
            setIsOn(next);
            void queryClient.invalidateQueries();
        },
        [queryClient, setIsOn],
    );
    return [isOn, set];
};
