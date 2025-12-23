import {
    isField,
    type AndFilterGroup,
    type DashboardFilters,
    type FieldValueSearchResult,
    type FilterRule,
    type FilterableItem,
    type ParametersValuesMap,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import { v4 as uuid4 } from 'uuid';
import Context, { type DefaultFieldsMap } from './context';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
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
    popoverProps?: Omit<PopoverProps, 'children'>;
    children?: ReactNode;
};

const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    dashboardFilters,
    autocompleteEnabled = true,
    autocompleteKey,
    fieldValuesRequest,
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
                        return isNotSelectedFilter;
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
                autocompleteEnabled,
                autocompleteKey,
                fieldValuesRequest,
                getField,
                getAutocompleteFilterGroup,
                popoverProps,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
