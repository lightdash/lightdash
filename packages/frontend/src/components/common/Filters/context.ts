import {
    type AndFilterGroup,
    type DashboardAvailableFilters,
    type DashboardTile,
    type FilterableItem,
    type FilterRule,
    type ItemsMap,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { createContext } from 'react';

export type DefaultFieldsMap = Record<
    string,
    ItemsMap[string] & { suggestions?: string[] }
>;

export type FilterPopoverProps = {
    withinPortal?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
};

export type FiltersContext<T extends DefaultFieldsMap = DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    getField: (filterRule: FilterRule) => T[keyof T] | undefined;
    getAutocompleteFilterGroup: (
        filterId: string,
        item: FilterableItem,
    ) => AndFilterGroup | undefined;
    popoverProps?: FilterPopoverProps;
    parameterValues?: ParametersValuesMap;
    metricQueryTimezone?: string;
    dashboardTiles?: DashboardTile[];
    filterBoundaryContexts?: DashboardAvailableFilters['filterBoundaryContexts'];
};

const Context = createContext<FiltersContext | undefined>(undefined);

export default Context;
