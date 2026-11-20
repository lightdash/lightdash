import { createChoiceStore } from './createChoiceStore';

export const CONTENT_ICON_SET_KEYS = ['current', 'a'] as const;
export type ContentIconSetKey = (typeof CONTENT_ICON_SET_KEYS)[number];

const store = createChoiceStore(
    'lightdash-content-icon-set',
    CONTENT_ICON_SET_KEYS,
    'a',
);

export const isContentIconSetKey = store.isKey;
export const setContentIconSetKey = store.set;
/** Which experimental content icon set the app draws with. */
export const useContentIconSetKey = store.useChoice;
