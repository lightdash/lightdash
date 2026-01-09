import {
    type AndFilterGroup,
    type AnyType,
    type FieldValueSearchResult,
    type FilterableField,
    type FilterableItem,
    type FilterRule,
    type ItemsMap,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { createContext } from 'react';

export type DefaultFieldsMap = Record<
    string,
    ItemsMap[string] & { suggestions?: string[] }
>;

export type FiltersContext<T extends DefaultFieldsMap = DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    autocompleteEnabled?: boolean;
    autocompleteKey?: string;
    fieldValuesRequest?: (args: {
        projectUuid: string;
        field: FilterableItem;
        fieldId: string;
        tableName?: string;
        search: string;
        forceRefresh: boolean;
        filters: AndFilterGroup | undefined;
        limit: number;
        parameterValues?: ParametersValuesMap;
    }) => Promise<FieldValueSearchResult<string>>;
    getField: (filterRule: FilterRule) => T[keyof T] | undefined;
    getFieldId?: (field: FilterableField) => string;
    createFilterRule?: (field: FilterableField, value?: AnyType) => FilterRule;
    getAutocompleteFilterGroup: (
        filterId: string,
        item: FilterableItem,
    ) => AndFilterGroup | undefined;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

const Context = createContext<FiltersContext | undefined>(undefined);

export default Context;
