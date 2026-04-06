import {
    getFilterRulesFromGroup,
    getItemId,
    isFilterRule,
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableItem,
    type FilterRule,
    type Filters,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import { v4 as uuid4 } from 'uuid';
import Context, { type DefaultFieldsMap } from './context';
import { getAutocompleteFilterGroup } from './utils/getAutocompleteFilterGroup';

type CommonProps<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    popoverProps?: Omit<PopoverProps, 'children'>;
    parameterValues?: ParametersValuesMap;
    activeTabUuid?: string;
    children?: ReactNode;
};

type ExploreFilterContextProps = {
    exploreFilters: Filters;
    dashboardFilters?: never;
    dashboardTiles?: never;
    filterableFieldsByTileUuid?: never;
};

type DashboardFilterContextProps = {
    exploreFilters?: never;
    dashboardFilters: DashboardFilters;
    dashboardTiles?: DashboardTile[];
    filterableFieldsByTileUuid?: Record<string, DashboardFilterableField[]>;
};

type NoFilterContextProps = {
    exploreFilters?: never;
    dashboardFilters?: never;
    dashboardTiles?: never;
    filterableFieldsByTileUuid?: never;
};

type FilterContextProps =
    | ExploreFilterContextProps
    | DashboardFilterContextProps
    | NoFilterContextProps;

type Props<T extends DefaultFieldsMap> = CommonProps<T> & FilterContextProps;

const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    exploreFilters,
    dashboardFilters,
    dashboardTiles,
    filterableFieldsByTileUuid,
    popoverProps,
    parameterValues,
    activeTabUuid,
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

    const getAutocompleteFilterGroupCallback = useCallback(
        (filterId: string, item: FilterableItem) => {
            // Explore view: use explore's active dimension filters as cross-filters
            if (exploreFilters && !dashboardFilters) {
                const currentFieldId = getItemId(item);
                const dimensionRules = getFilterRulesFromGroup(
                    exploreFilters.dimensions,
                );
                const crossFilterRules = dimensionRules.filter(
                    (rule) =>
                        isFilterRule(rule) &&
                        rule.id !== filterId &&
                        rule.target.fieldId !== currentFieldId,
                );
                if (crossFilterRules.length === 0) {
                    return undefined;
                }
                return {
                    id: uuid4(),
                    and: crossFilterRules,
                };
            }

            return getAutocompleteFilterGroup({
                filterId,
                item,
                dashboardFilters,
                dashboardTiles,
                filterableFieldsByTileUuid,
                activeTabUuid,
            });
        },
        [
            exploreFilters,
            dashboardFilters,
            dashboardTiles,
            filterableFieldsByTileUuid,
            activeTabUuid,
        ],
    );

    return (
        <Context.Provider
            value={{
                projectUuid,
                itemsMap,
                startOfWeek,
                baseTable,
                exploreFilters,
                getField,
                getAutocompleteFilterGroup: getAutocompleteFilterGroupCallback,
                popoverProps,
                parameterValues,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
