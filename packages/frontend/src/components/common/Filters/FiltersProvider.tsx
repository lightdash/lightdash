import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableItem,
    type FilterRule,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { useCallback, type ReactNode } from 'react';
import { type SavedFilterFieldsByTileUuid } from '../../../features/dashboardFilters/FilterConfiguration/utils';
import Context, {
    type DefaultFieldsMap,
    type FilterPopoverProps,
} from './context';
import { getAutocompleteFilterGroup } from './utils/getAutocompleteFilterGroup';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    dashboardTiles?: DashboardTile[];
    filterableFieldsByTileUuid?: Record<string, DashboardFilterableField[]>;
    savedFilterFieldsByTileUuid?: SavedFilterFieldsByTileUuid;
    popoverProps?: FilterPopoverProps;
    parameterValues?: ParametersValuesMap;
    activeTabUuid?: string;
    metricQueryTimezone?: string;
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
    savedFilterFieldsByTileUuid,
    popoverProps,
    parameterValues,
    activeTabUuid,
    metricQueryTimezone,
    children,
}: Props<T>) => {
    const getField = useCallback(
        (filterRule: FilterRule) => {
            return getDashboardFilterField(
                itemsMap,
                filterRule,
                filterableFieldsByTileUuid,
            );
        },
        [itemsMap, filterableFieldsByTileUuid],
    );

    const getAutocompleteFilterGroupCallback = useCallback(
        (filterId: string, item: FilterableItem) =>
            getAutocompleteFilterGroup({
                filterId,
                item,
                dashboardFilters,
                dashboardTiles,
                filterableFieldsByTileUuid,
                savedFilterFieldsByTileUuid,
                activeTabUuid,
            }),
        [
            dashboardFilters,
            dashboardTiles,
            filterableFieldsByTileUuid,
            savedFilterFieldsByTileUuid,
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
                getField,
                getAutocompleteFilterGroup: getAutocompleteFilterGroupCallback,
                popoverProps,
                parameterValues,
                metricQueryTimezone,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
