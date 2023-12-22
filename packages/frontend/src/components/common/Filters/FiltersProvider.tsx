import {
    AndFilterGroup,
    DashboardFilters,
    FilterableField,
    FilterableItem,
    FilterRule,
    isField,
    WeekDay,
} from '@lightdash/common';
import { PopoverProps } from '@mantine/core';
import { uuid4 } from '@sentry/utils';
import { createContext, FC, useCallback, useContext } from 'react';

export type FieldWithSuggestions = FilterableField & {
    suggestions?: string[];
};

export type FieldsWithSuggestions = Record<string, FieldWithSuggestions>;

type FiltersContext = {
    projectUuid?: string;
    fieldsMap: FieldsWithSuggestions;
    startOfWeek?: WeekDay;
    getField: (filterRule: FilterRule) => FieldWithSuggestions | undefined;
    getAutocompleteFilterGroup: (
        filterId: string,
        item: FilterableItem,
    ) => AndFilterGroup | undefined;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

const Context = createContext<FiltersContext | undefined>(undefined);

type Props = {
    projectUuid?: string;
    fieldsMap?: Record<string, FieldWithSuggestions>;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

export const FiltersProvider: FC<React.PropsWithChildren<Props>> = ({
    projectUuid,
    fieldsMap = {},
    startOfWeek,
    dashboardFilters,
    popoverProps,
    children,
}) => {
    const getField = useCallback(
        (filterRule: FilterRule) => {
            if (fieldsMap) {
                return fieldsMap[filterRule.target.fieldId];
            }
        },
        [fieldsMap],
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
                fieldsMap,
                startOfWeek,
                getField,
                getAutocompleteFilterGroup,
                popoverProps,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export function useFiltersContext(): FiltersContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useFiltersContext must be used within a FiltersProvider',
        );
    }
    return context;
}
