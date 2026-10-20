import { parseAdoptionView, type AdoptionView } from './adoptionNav';

const STORAGE_PREFIX = 'lightdash-adoption-view';

type StorageSource = () => Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage: StorageSource = () => window.localStorage;

export const getViewStorageKey = (userUuid: string | undefined): string =>
    `${STORAGE_PREFIX}:${userUuid ?? 'anonymous'}`;

// Storage can be blocked or full; the page then just falls back to the default view
export const readStoredView = (
    key: string,
    getStorage: StorageSource = browserStorage,
): string | null => {
    try {
        return getStorage().getItem(key);
    } catch {
        return null;
    }
};

export const writeStoredView = (
    key: string,
    view: AdoptionView,
    getStorage: StorageSource = browserStorage,
): void => {
    try {
        getStorage().setItem(key, view);
    } catch {
        // Nothing to do: the choice still applies for this visit
    }
};

// The link wins, then the remembered choice, then the default view
export const resolveAdoptionView = (
    param: string | null,
    stored: string | null,
): AdoptionView => parseAdoptionView(param ?? stored);
