import {
    isField,
    type AndFilterGroup,
    type DashboardFilters,
    type FilterableItem,
    type FilterRule,
    type ItemsMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { uuid4 } from '@sentry/utils';
import { createContext, useCallback, useContext, type ReactNode } from 'react';

type DefaultFieldsMap = Record<
    string,
    ItemsMap[string] & { suggestions?: string[] }
>;

type FiltersContext<T extends DefaultFieldsMap = DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    getField: (filterRule: FilterRule) => T[keyof T] | undefined;
    getAutocompleteFilterGroup: (
        filterId: string,
        item: FilterableItem,
    ) => AndFilterGroup | undefined;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

const Context = createContext<FiltersContext | undefined>(undefined);

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    popoverProps?: Omit<PopoverProps, 'children'>;
    children?: ReactNode;
};

export const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    dashboardFilters,
    popoverProps,
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
            return {
                id: uuid4(),
                and: dashboardFilters.dimensions.filter(
                    (dimensionFilterRule) => {
                        const isNotSelectedFilter =
                            dimensionFilterRule.id !== filterId;
                        const hasSameTable =
                            dimensionFilterRule.target.tableName === item.table;
                        return isNotSelectedFilter && hasSameTable;
                    },
                ),
            };
        },
        [dashboardFilters],
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
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useFiltersContext<
    T extends DefaultFieldsMap = DefaultFieldsMap,
>(): FiltersContext<T> {
    const context = useContext(
        Context as React.Context<FiltersContext<T> | undefined>,
    );
    if (context === undefined) {
        throw new Error(
            'useFiltersContext must be used within a FiltersProvider',
        );
    }
    return context;
}
