import { FilterableField, FilterRule } from '@lightdash/common';
import React, { createContext, FC, useCallback, useContext } from 'react';

export type FieldWithSuggestions = FilterableField & {
    suggestions?: string[];
};

export type FieldsWithSuggestions = Record<string, FieldWithSuggestions>;

type FiltersContext = {
    projectUuid: string;
    fieldsMap: FieldsWithSuggestions;
    getField: (filterRule: FilterRule) => FieldWithSuggestions | undefined;
};

const Context = createContext<FiltersContext | undefined>(undefined);

type Props = {
    projectUuid: string;
    fieldsMap: Record<string, FieldWithSuggestions>;
};

export const FiltersProvider: FC<Props> = ({
    projectUuid,
    fieldsMap,
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
        <Context.Provider value={{ projectUuid, fieldsMap, getField }}>
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
