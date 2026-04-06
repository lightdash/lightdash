import {
    getItemId,
    isField,
    type AndFilterGroup,
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableItem,
} from '@lightdash/common';
import { v4 as uuid4 } from 'uuid';
import { doesFilterApplyToTile } from '../../../../features/dashboardFilters/FilterConfiguration/utils';

type GetAutocompleteFilterGroupArgs = {
    filterId: string;
    item: FilterableItem;
    dashboardFilters: DashboardFilters | undefined;
    dashboardTiles: DashboardTile[] | undefined;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    activeTabUuid: string | undefined;
};

export const getAutocompleteFilterGroup = ({
    filterId,
    item,
    dashboardFilters,
    dashboardTiles,
    filterableFieldsByTileUuid,
    activeTabUuid,
}: GetAutocompleteFilterGroupArgs): AndFilterGroup | undefined => {
    if (!dashboardFilters || !isField(item)) {
        return undefined;
    }

    const currentFieldId = getItemId(item);

    // Find the current filter to get its tileTargets
    const currentFilter = dashboardFilters.dimensions.find(
        (f) => f.id === filterId,
    );

    // Only consider tiles on the active tab when checking overlap.
    // Without this, tab-scoped filters from other tabs leak into
    // autocomplete queries via tile overlap on those other tabs.
    const tilesForOverlapCheck =
        activeTabUuid && dashboardTiles
            ? dashboardTiles.filter((tile) => tile.tabUuid === activeTabUuid)
            : dashboardTiles;

    // Get tiles that the current filter applies to
    const currentFilterTileUuids =
        tilesForOverlapCheck && filterableFieldsByTileUuid
            ? new Set(
                  tilesForOverlapCheck
                      .filter((tile) => {
                          // For new filters (not yet in dashboardFilters),
                          // check if tile has the field
                          if (!currentFilter) {
                              const tileFields =
                                  filterableFieldsByTileUuid[tile.uuid];
                              return tileFields?.some(
                                  (f) => getItemId(f) === currentFieldId,
                              );
                          }
                          // For existing filters, use doesFilterApplyToTile
                          return doesFilterApplyToTile(
                              currentFilter,
                              tile,
                              filterableFieldsByTileUuid,
                          );
                      })
                      .map((tile) => tile.uuid),
              )
            : null;

    return {
        id: uuid4(),
        and: dashboardFilters.dimensions.filter((dimensionFilterRule) => {
            // Exclude the current filter itself
            if (dimensionFilterRule.id === filterId) {
                return false;
            }

            // Exclude same-field filters - otherwise the autocomplete
            // would be over-restricted (e.g., if Status=completed is set,
            // another Status filter would only see "completed").
            if (dimensionFilterRule.target.fieldId === currentFieldId) {
                return false;
            }

            // For different-field filters, exclude if no tile overlap.
            // Filters on different tabs shouldn't affect each other's
            // autocomplete queries.
            if (
                currentFilterTileUuids &&
                tilesForOverlapCheck &&
                filterableFieldsByTileUuid
            ) {
                const hasOverlap = tilesForOverlapCheck.some(
                    (tile) =>
                        currentFilterTileUuids.has(tile.uuid) &&
                        doesFilterApplyToTile(
                            dimensionFilterRule,
                            tile,
                            filterableFieldsByTileUuid,
                        ),
                );
                if (!hasOverlap) {
                    return false;
                }
            }

            return true;
        }),
    };
};
