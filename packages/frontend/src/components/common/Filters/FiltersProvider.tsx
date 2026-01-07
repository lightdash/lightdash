import {
    getItemId,
    isField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
    type FilterableItem,
    type FilterRule,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import { v4 as uuid4 } from 'uuid';
import { doesFilterApplyToTile } from '../../../features/dashboardFiltersV2/FilterConfiguration/utils';
import Context, { type DefaultFieldsMap } from './context';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    dashboardTiles?: DashboardTile[];
    filterableFieldsByTileUuid?: Record<string, FilterableDimension[]>;
    popoverProps?: Omit<PopoverProps, 'children'>;
    parameterValues?: ParametersValuesMap;
    children?: ReactNode;
};

const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    dashboardFilters,
    dashboardTiles,
    filterableFieldsByTileUuid,
    popoverProps,
    parameterValues,
    children,
}: Props<T>) => {
    const getField = useCallback(
        (filterRule: FilterRule) => {
            if (itemsMap) {
                return itemsMap[filterRule.target.fieldId];
            }
        },
        [itemsMap],
    );

    const getAutocompleteFilterGroup = useCallback(
        (filterId: string, item: FilterableItem) => {
            if (!dashboardFilters || !isField(item)) {
                return undefined;
            }

            const currentFieldId = getItemId(item);

            // Find the current filter to get its tileTargets
            const currentFilter = dashboardFilters.dimensions.find(
                (f) => f.id === filterId,
            );

            // Get tiles that the current filter applies to
            const currentFilterTileUuids =
                dashboardTiles && filterableFieldsByTileUuid
                    ? new Set(
                          dashboardTiles
                              .filter((tile) => {
                                  // For new filters (not yet in dashboardFilters),
                                  // check if tile has the field
                                  if (!currentFilter) {
                                      const tileFields =
                                          filterableFieldsByTileUuid[tile.uuid];
                                      return tileFields?.some(
                                          (f) =>
                                              getItemId(f) === currentFieldId,
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
                and: dashboardFilters.dimensions.filter(
                    (dimensionFilterRule) => {
                        // Exclude the current filter itself
                        if (dimensionFilterRule.id === filterId) {
                            return false;
                        }

                        // Exclude same-field filters - otherwise the autocomplete
                        // would be over-restricted (e.g., if Status=completed is set,
                        // another Status filter would only see "completed").
                        if (
                            dimensionFilterRule.target.fieldId ===
                            currentFieldId
                        ) {
                            return false;
                        }

                        // For different-field filters, exclude if no tile overlap.
                        // Filters on different tabs shouldn't affect each other's
                        // autocomplete queries.
                        if (
                            currentFilterTileUuids &&
                            dashboardTiles &&
                            filterableFieldsByTileUuid
                        ) {
                            const hasOverlap = dashboardTiles.some(
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
                    },
                ),
            };
        },
        [dashboardFilters, dashboardTiles, filterableFieldsByTileUuid],
    );
    return (
        <Context.Provider
            value={{
                projectUuid,
                itemsMap,
                startOfWeek,
                baseTable,
                getField,
                getAutocompleteFilterGroup,
                popoverProps,
                parameterValues,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
