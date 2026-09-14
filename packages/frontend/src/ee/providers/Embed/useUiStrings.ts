import {
    DEFAULT_UI_STRINGS,
    type UiStringKey,
    type UiStringResolver,
} from '@lightdash/common';
import { useCallback } from 'react';
import useEmbed from './useEmbed';

// Returns override ?? English default. Outside an embed context the provider
// default t() returns undefined, so this resolves to the defaults everywhere.
export const useUiStrings = (): UiStringResolver => {
    const { t } = useEmbed();
    return useCallback(
        (key: UiStringKey) => t(key) ?? DEFAULT_UI_STRINGS[key],
        [t],
    );
};

export const useUiString = (key: UiStringKey): string => useUiStrings()(key);
