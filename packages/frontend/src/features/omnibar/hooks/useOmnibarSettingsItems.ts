import { SearchItemType } from '@lightdash/common';
import { useMemo } from 'react';
import { searchSettingsNavigationItemsWithPath } from '../../../hooks/settings/filterSettingsNavigation';
import { useSettingsContext } from '../../../hooks/settings/useSettingsContext';
import { useSettingsNavigation } from '../../../hooks/settings/useSettingsNavigation';
import { type SearchItem } from '../types/searchItem';
import { hasMinQueryLength } from './useSearch';

/**
 * Settings pages matching `query`, as omnibar `SearchItem`s. The nav model is
 * already permission-gated, so matches never leak pages the user can't reach.
 */
export const useOmnibarSettingsItems = (query: string): SearchItem[] => {
    const context = useSettingsContext();
    const sections = useSettingsNavigation(context);

    return useMemo(() => {
        if (!hasMinQueryLength(query)) {
            return [];
        }

        return searchSettingsNavigationItemsWithPath(
            sections,
            query,
        ).map<SearchItem>(({ item, path }) => ({
            type: SearchItemType.SETTINGS,
            title: item.label,
            icon: item.icon,
            contextLabel: path[path.length - 1],
            location: { pathname: item.to },
        }));
    }, [sections, query]);
};
