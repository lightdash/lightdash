import {
    AndFilterGroup,
    DashboardFilters,
    FilterableField,
    FilterRule,
    WeekDay,
} from '@lightdash/common';
import { uuid4 } from '@sentry/utils';
import React, { createContext, FC, useCallback, useContext } from 'react';

export type FieldWithSuggestions = FilterableField & {
    suggestions?: string[];
};

export type FieldsWithSuggestions = Record<string, FieldWithSuggestions>;

type FiltersContext = {
    projectUuid?: string;
    fieldsMap: FieldsWithSuggestions;
    startOfWeek?: WeekDay | null;
    getField: (filterRule: FilterRule) => FieldWithSuggestions | undefined;
    getRelatedFilterGroup: (filterId: string) => AndFilterGroup;
};

const Context = createContext<FiltersContext | undefined>(undefined);

type Props = {
    projectUuid?: string;
    fieldsMap?: Record<string, FieldWithSuggestions>;
    startOfWeek?: WeekDay | null;
    dashboardFilters?: DashboardFilters;
};

export const FiltersProvider: FC<Props> = ({
    projectUuid,
    fieldsMap = {},
    startOfWeek,
    dashboardFilters,
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
    const getRelatedFilterGroup = useCallback(
        (filterId: string) => {
            const filterGroup: AndFilterGroup = {
                id: uuid4(),
                and: [],
            };
            if (dashboardFilters) {
                const relatedFilterRules = dashboardFilters.dimensions.filter(
                    (dimensionFilterRule) => {
                        return dimensionFilterRule.id !== filterId;
                    },
                );
                filterGroup.and.push(...relatedFilterRules);
            }
            return filterGroup;
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
                getRelatedFilterGroup,
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
