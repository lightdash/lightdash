import { TableSelectionType, type TablesConfiguration } from '../types/api';
import { isUserManagedExplore, type ExploreType } from '../types/explore';

/**
 * Whether an explore is included by the project's Tables configuration
 * (Project settings → Tables configuration). User-managed explores (virtual
 * views, external source tables) are always included — they are created in
 * the app, not compiled from dbt, so tag/name selections cannot cover them.
 */
export const isExploreIncludedInTableSelection = (
    explore: { name: string; tags?: string[]; type?: ExploreType },
    tableSelection: TablesConfiguration['tableSelection'],
): boolean => {
    switch (tableSelection.type) {
        case TableSelectionType.ALL:
            return true;
        case TableSelectionType.WITH_TAGS:
            return (
                (explore.tags ?? []).some((tag) =>
                    (tableSelection.value ?? []).includes(tag),
                ) || isUserManagedExplore(explore)
            );
        case TableSelectionType.WITH_NAMES:
            return (
                (tableSelection.value ?? []).includes(explore.name) ||
                isUserManagedExplore(explore)
            );
        default:
            return true;
    }
};
