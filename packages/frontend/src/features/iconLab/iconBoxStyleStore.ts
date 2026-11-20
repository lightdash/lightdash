import { createChoiceStore } from './createChoiceStore';

export const ICON_BOX_STYLE_KEYS = ['current', 'none'] as const;
export type IconBoxStyleKey = (typeof ICON_BOX_STYLE_KEYS)[number];

const store = createChoiceStore(
    'lightdash-icon-box-style',
    ICON_BOX_STYLE_KEYS,
    'none',
);

export const isIconBoxStyleKey = store.isKey;
export const setIconBoxStyleKey = store.set;
/** How the box around a content icon is drawn, as picked in the icon lab. */
export const useIconBoxStyleKey = store.useChoice;
