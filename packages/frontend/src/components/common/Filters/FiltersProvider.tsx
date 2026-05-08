import {
    type DashboardFilterableField,
    type DashboardFilters,
    type DashboardTile,
    type FilterableItem,
    type FilterRule,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import Context, { type DefaultFieldsMap } from './context';
import { getAutocompleteFilterGroup } from './utils/getAutocompleteFilterGroup';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    dashboardTiles?: DashboardTile[];
    filterableFieldsByTileUuid?: Record<string, DashboardFilterableField[]>;
    popoverProps?: Omit<PopoverProps, 'children'>;
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
    popoverProps,
    parameterValues,
    activeTabUuid,
    metricQueryTimezone,
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
        (filterId: string, item: FilterableItem) =>
            getAutocompleteFilterGroup({
                filterId,
                item,
                dashboardFilters,
                dashboardTiles,
                filterableFieldsByTileUuid,
                activeTabUuid,
            }),
        [
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
