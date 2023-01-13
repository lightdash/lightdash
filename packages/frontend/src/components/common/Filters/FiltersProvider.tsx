import { FilterableField, FilterRule, WeekDay } from '@lightdash/common';
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
};

const Context = createContext<FiltersContext | undefined>(undefined);

type Props = {
    projectUuid?: string;
    fieldsMap?: Record<string, FieldWithSuggestions>;
    startOfWeek?: WeekDay | null;
};

export const FiltersProvider: FC<Props> = ({
    projectUuid,
    fieldsMap = {},
    startOfWeek,
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
    return (
        <Context.Provider
            value={{ projectUuid, fieldsMap, startOfWeek, getField }}
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
