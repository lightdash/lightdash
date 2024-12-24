import {
    type AndFilterGroup,
    type FilterableItem,
    type FilterRule,
    type ItemsMap,
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
    getField: (filterRule: FilterRule) => T[keyof T] | undefined;
    getAutocompleteFilterGroup: (
        filterId: string,
        item: FilterableItem,
    ) => AndFilterGroup | undefined;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

const Context = createContext<FiltersContext | undefined>(undefined);

export default Context;
